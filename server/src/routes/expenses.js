import { Router } from 'express';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError, badRequest, conflict, notFound } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../models/AuditLog.js';
import Expense, { SOURCES, serializeExpense } from '../models/Expense.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import { runExpenseAlerts } from '../services/alerts.js';
import { bumpUser } from '../services/cache.js';
import { CATEGORIES, PAYMENT_METHODS, guessCategory } from '../utils/categories.js';
import { escapeRegex, sha256 } from '../utils/crypto.js';
import { DATE_RE, dayEnd, dayStart, resolveExpenseDate } from '../utils/dates.js';
import { fromMinor, toMinor } from '../utils/money.js';

const router = Router();
router.use(requireAuth);

// ------------------------------------------------------------------ schemas
export const amountField = z.union([z.string().max(20), z.number()]).transform((v, ctx) => {
  const minor = toMinor(v);
  if (!minor) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid amount greater than 0 (max 2 decimals)' });
    return z.NEVER;
  }
  return minor;
});

const dateField = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const expenseBody = z.object({
  amount: amountField,
  merchant: z.string().trim().min(1, 'Merchant / description is required').max(100),
  category: z.enum(CATEGORIES).optional(),
  note: z.string().trim().max(500).optional().default(''),
  date: dateField.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default('UPI'),
  source: z.enum(SOURCES).optional().default('manual'),
});

const patchBody = z
  .object({
    amount: amountField.optional(),
    merchant: z.string().trim().min(1).max(100).optional(),
    category: z.enum(CATEGORIES).optional(),
    note: z.string().trim().max(500).optional(),
    date: dateField.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid expense id') });

const csvList = (allowed) =>
  z
    .string()
    .max(500)
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(allowed)).max(allowed.length));

const SORTS = {
  date_desc: { date: -1, _id: -1 },
  date_asc: { date: 1, _id: 1 },
  amount_desc: { amountMinor: -1, _id: -1 },
  amount_asc: { amountMinor: 1, _id: 1 },
};

const listQuery = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  category: csvList(CATEGORIES).optional(),
  paymentMethod: csvList(PAYMENT_METHODS).optional(),
  q: z.string().trim().max(100).optional(),
  min: amountField.optional(),
  max: amountField.optional(),
  sort: z.enum(Object.keys(SORTS)).default('date_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ------------------------------------------------------------------ helpers
function buildFilter(user, q) {
  const tz = user.timezone;
  const filter = { userId: new mongoose.Types.ObjectId(String(user._id)) };
  if (q.from || q.to) {
    filter.date = {};
    if (q.from) filter.date.$gte = dayStart(q.from, tz);
    if (q.to) filter.date.$lt = dayEnd(q.to, tz);
  }
  if (q.category?.length) filter.category = { $in: q.category };
  if (q.paymentMethod?.length) filter.paymentMethod = { $in: q.paymentMethod };
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ merchant: re }, { note: re }];
  }
  if (q.min || q.max) {
    filter.amountMinor = {};
    if (q.min) filter.amountMinor.$gte = q.min;
    if (q.max) filter.amountMinor.$lte = q.max;
  }
  return filter;
}

function toDoc(user, body) {
  const date = resolveExpenseDate(body.date, user.timezone);
  if (!date) throw badRequest('Invalid date');
  return {
    userId: user._id,
    amountMinor: body.amount,
    currency: user.currency,
    merchant: body.merchant,
    category: body.category || guessCategory(body.merchant, body.note) || 'Other',
    note: body.note || '',
    date,
    paymentMethod: body.paymentMethod,
    source: body.source,
  };
}

/**
 * Idempotency-Key support: a retried POST with the same key returns the
 * original response instead of creating a duplicate.
 */
async function idempotent(req, res, handler) {
  const key = req.get('idempotency-key');
  if (!key) {
    const { status, body } = await handler();
    return res.status(status).json(body);
  }
  if (key.length > 100) throw badRequest('Idempotency-Key too long');

  const userId = req.user._id;
  const requestHash = sha256(JSON.stringify(req.body ?? {}));
  try {
    await IdempotencyKey.create({ userId, key, requestHash });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const prior = await IdempotencyKey.findOne({ userId, key }).lean();
    if (!prior) throw conflict('Please retry the request', { code: 'IDEMPOTENCY_RETRY' });
    if (prior.requestHash !== requestHash) {
      throw new AppError(422, 'Idempotency-Key was already used for a different request', { code: 'IDEMPOTENCY_MISMATCH' });
    }
    if (prior.status !== 'done') throw conflict('This request is already being processed', { code: 'IDEMPOTENCY_IN_PROGRESS' });
    res.set('Idempotent-Replayed', 'true');
    return res.status(prior.responseStatus).json(prior.responseBody);
  }

  try {
    const { status, body } = await handler();
    await IdempotencyKey.updateOne({ userId, key }, { $set: { status: 'done', responseStatus: status, responseBody: body } });
    return res.status(status).json(body);
  } catch (err) {
    await IdempotencyKey.deleteOne({ userId, key });
    throw err;
  }
}

function afterWrite(user, docs) {
  bumpUser(user._id);
  if (docs?.length) runExpenseAlerts(user, docs);
}

// ------------------------------------------------------------------ routes
router.get('/', validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query;
  const filter = buildFilter(req.user, q);
  const [result] = await Expense.aggregate([
    { $match: filter },
    {
      $facet: {
        items: [{ $sort: SORTS[q.sort] }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }],
        meta: [{ $group: { _id: null, total: { $sum: 1 }, sumMinor: { $sum: '$amountMinor' } } }],
      },
    },
  ]);
  const total = result.meta[0]?.total || 0;
  res.json({
    items: result.items.map(serializeExpense),
    page: q.page,
    limit: q.limit,
    total,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    sumMinor: result.meta[0]?.sumMinor || 0,
  });
});

router.get('/export.csv', validate({ query: listQuery.omit({ page: true, limit: true }) }), async (req, res) => {
  const q = req.valid.query;
  const tz = req.user.timezone;
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // block CSV formula injection in Excel/Sheets
    return `"${s.replace(/"/g, '""')}"`;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-${DateTime.now().setZone(tz).toISODate()}.csv"`);
  res.write('﻿Date,Merchant,Category,Amount,Currency,Payment Method,Note,Source\n');
  const cursor = Expense.find(buildFilter(req.user, q)).sort(SORTS[q.sort]).lean().cursor();
  for await (const e of cursor) {
    const line = [
      DateTime.fromJSDate(e.date).setZone(tz).toFormat('yyyy-MM-dd HH:mm'),
      e.merchant,
      e.category,
      fromMinor(e.amountMinor),
      e.currency,
      e.paymentMethod,
      e.note,
      e.source,
    ].map(cell);
    if (!res.write(`${line.join(',')}\n`)) await new Promise((r) => res.once('drain', r));
  }
  res.end();
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const e = await Expense.findOne({ _id: req.valid.params.id, userId: req.user._id }).lean();
  if (!e) throw notFound('Expense not found');
  res.json({ expense: serializeExpense(e) });
});

router.post('/', validate({ body: expenseBody }), (req, res) =>
  idempotent(req, res, async () => {
    const doc = await Expense.create(toDoc(req.user, req.valid.body));
    afterWrite(req.user, [doc]);
    audit(req, req.user._id, 'expense.create', { entityId: doc._id, meta: { amountMinor: doc.amountMinor } });
    return { status: 201, body: { expense: serializeExpense(doc) } };
  }),
);

router.post('/bulk', validate({ body: z.object({ expenses: z.array(expenseBody).min(1).max(50) }) }), (req, res) =>
  idempotent(req, res, async () => {
    const docs = await Expense.insertMany(req.valid.body.expenses.map((b) => toDoc(req.user, b)));
    afterWrite(req.user, docs);
    audit(req, req.user._id, 'expense.bulk_create', {
      meta: { count: docs.length, totalMinor: docs.reduce((s, d) => s + d.amountMinor, 0) },
    });
    return { status: 201, body: { expenses: docs.map(serializeExpense) } };
  }),
);

router.patch('/:id', validate({ params: idParams, body: patchBody }), async (req, res) => {
  const b = req.valid.body;
  const $set = {};
  if (b.amount !== undefined) $set.amountMinor = b.amount;
  for (const k of ['merchant', 'category', 'note', 'paymentMethod']) if (b[k] !== undefined) $set[k] = b[k];
  if (b.date !== undefined) {
    $set.date = resolveExpenseDate(b.date, req.user.timezone);
    if (!$set.date) throw badRequest('Invalid date');
  }
  const before = await Expense.findOneAndUpdate({ _id: req.valid.params.id, userId: req.user._id }, { $set }, { runValidators: true }).lean();
  if (!before) throw notFound('Expense not found');
  const after = { ...before, ...$set, updatedAt: new Date() };
  afterWrite(req.user, [after]);
  audit(req, req.user._id, 'expense.update', {
    entityId: before._id,
    meta: Object.fromEntries(Object.keys($set).map((k) => [k, { from: before[k], to: $set[k] }])),
  });
  res.json({ expense: serializeExpense(after) });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const deleted = await Expense.findOneAndDelete({ _id: req.valid.params.id, userId: req.user._id }).lean();
  if (!deleted) throw notFound('Expense not found');
  afterWrite(req.user, []);
  audit(req, req.user._id, 'expense.delete', {
    entityId: deleted._id,
    meta: { amountMinor: deleted.amountMinor, merchant: deleted.merchant, date: deleted.date },
  });
  res.status(204).end();
});

export default router;
