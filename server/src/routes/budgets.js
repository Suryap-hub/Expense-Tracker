import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../models/AuditLog.js';
import Budget from '../models/Budget.js';
import { getOverview } from '../services/analytics.js';
import { checkBudgets } from '../services/alerts.js';
import { bumpUser } from '../services/cache.js';
import { BUDGET_CATEGORIES } from '../utils/categories.js';
import { currentPeriod } from '../utils/dates.js';
import logger from '../config/logger.js';
import { amountField } from './expenses.js';

const router = Router();
router.use(requireAuth);

const categoryParam = z.object({ category: z.enum(BUDGET_CATEGORIES) });

/** Budgets with this month's progress. */
router.get('/', async (req, res) => {
  const overview = await getOverview(req.user, currentPeriod(req.user.timezone));
  res.json({ period: overview.period, budgets: overview.budgets });
});

router.put('/:category', validate({ params: categoryParam, body: z.object({ limit: amountField }) }), async (req, res) => {
  const { category } = req.valid.params;
  const budget = await Budget.findOneAndUpdate(
    { userId: req.user._id, category },
    { $set: { limitMinor: req.valid.body.limit } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  bumpUser(req.user._id);
  audit(req, req.user._id, 'budget.set', { meta: { category, limitMinor: budget.limitMinor } });
  // If the new limit is already crossed this month, alert right away.
  checkBudgets(req.user, [currentPeriod(req.user.timezone)], category === 'Overall' ? [] : [category]).catch((err) =>
    logger.error({ err }, 'budget check failed'),
  );
  res.json({ budget: { category: budget.category, limitMinor: budget.limitMinor } });
});

router.delete('/:category', validate({ params: categoryParam }), async (req, res) => {
  const { deletedCount } = await Budget.deleteOne({ userId: req.user._id, category: req.valid.params.category });
  if (!deletedCount) throw notFound('Budget not found');
  bumpUser(req.user._id);
  audit(req, req.user._id, 'budget.delete', { meta: { category: req.valid.params.category } });
  res.status(204).end();
});

export default router;
