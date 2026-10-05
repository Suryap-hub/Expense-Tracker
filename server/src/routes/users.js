import { Router } from 'express';
import { z } from 'zod';
import { invalidateUserCache, requireAuth } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../middleware/error.js';
import { emailLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import AuditLog, { audit } from '../models/AuditLog.js';
import Budget from '../models/Budget.js';
import EmailJob from '../models/EmailJob.js';
import Expense from '../models/Expense.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import NotificationLog from '../models/NotificationLog.js';
import Session from '../models/Session.js';
import User, { publicUser } from '../models/User.js';
import { REFRESH_COOKIE, refreshCookieOptions, revokeAllSessions } from '../services/auth.js';
import { bumpUser } from '../services/cache.js';
import { enqueueEmail } from '../services/email/outbox.js';
import { passwordChangedTemplate } from '../services/email/templates.js';
import { sendMonthlyReport } from '../services/monthlyReport.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { PERIOD_RE, currentPeriod, isValidTimezone } from '../utils/dates.js';
import { CURRENCY_CODES, toMinor } from '../utils/money.js';
import { passwordField } from './auth.js';

const router = Router();
router.use(requireAuth);

const settingsBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    currency: z.enum(CURRENCY_CODES).optional(),
    timezone: z.string().refine(isValidTimezone, 'Unknown timezone').optional(),
    // "0" turns large-expense alerts off.
    largeExpenseThreshold: z
      .union([z.string().max(20), z.number()])
      .transform((v, ctx) => {
        if (v === 0 || v === '0' || v === '') return 0;
        const m = toMinor(v);
        if (!m) {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid amount' });
          return z.NEVER;
        }
        return m;
      })
      .optional(),
    emailPrefs: z
      .object({ budgetAlerts: z.boolean().optional(), largeExpense: z.boolean().optional(), monthlySummary: z.boolean().optional() })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

router.get('/', (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/', validate({ body: settingsBody }), async (req, res) => {
  const b = req.valid.body;
  const $set = {};
  for (const k of ['name', 'currency', 'timezone']) if (b[k] !== undefined) $set[k] = b[k];
  if (b.largeExpenseThreshold !== undefined) $set.largeExpenseThresholdMinor = b.largeExpenseThreshold;
  for (const [k, v] of Object.entries(b.emailPrefs || {})) if (v !== undefined) $set[`emailPrefs.${k}`] = v;

  const user = await User.findByIdAndUpdate(req.user._id, { $set }, { new: true, runValidators: true });
  invalidateUserCache(user._id);
  bumpUser(user._id); // timezone/currency change affects analytics
  audit(req, user._id, 'user.update_settings', { meta: Object.keys($set) });
  res.json({ user: publicUser(user) });
});

router.post(
  '/change-password',
  validate({ body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordField }) }),
  async (req, res) => {
    const { currentPassword, newPassword } = req.valid.body;
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect', { code: 'BAD_CREDENTIALS' });
    if (currentPassword === newPassword) throw badRequest('New password must be different');

    user.passwordHash = await hashPassword(newPassword);
    user.tokenVersion += 1;
    await user.save();
    await revokeAllSessions(user._id);
    invalidateUserCache(user._id);
    audit(req, user._id, 'auth.password_change');
    const tpl = passwordChangedTemplate({ name: user.name });
    await enqueueEmail({ userId: user._id, type: 'password_changed', to: user.email, ...tpl });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ message: 'Password changed. Please sign in again.' });
  },
);

/** Recent security / account activity for the settings page. */
router.get('/activity', async (req, res) => {
  const items = await AuditLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({
    items: items.map((a) => ({ id: String(a._id), action: a.action, meta: a.meta, ip: a.ip, userAgent: a.userAgent, createdAt: a.createdAt })),
  });
});

/** "Email me my report now" - sends the summary for any month on demand. */
router.post(
  '/send-report',
  emailLimiter,
  validate({ body: z.object({ period: z.string().regex(PERIOD_RE).optional() }) }),
  async (req, res) => {
    if (!req.user.emailVerified) throw badRequest('Verify your email first');
    const period = req.valid.body.period || currentPeriod(req.user.timezone);
    await sendMonthlyReport(req.user, period, { force: true });
    res.json({ message: `Your report for ${period} is on its way to ${req.user.email}.` });
  },
);

/** Permanently delete the account and every piece of data tied to it. */
router.delete('/', validate({ body: z.object({ password: z.string().min(1).max(200) }) }), async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(req.valid.body.password, user.passwordHash))) throw unauthorized('Password is incorrect', { code: 'BAD_CREDENTIALS' });
  const userId = user._id;
  await Promise.all([
    Expense.deleteMany({ userId }),
    Budget.deleteMany({ userId }),
    Session.deleteMany({ userId }),
    NotificationLog.deleteMany({ userId }),
    IdempotencyKey.deleteMany({ userId }),
    EmailJob.deleteMany({ userId, status: { $ne: 'sent' } }),
    AuditLog.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
  invalidateUserCache(userId);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

export default router;
