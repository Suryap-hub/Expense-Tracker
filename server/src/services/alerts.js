import logger from '../config/logger.js';
import Budget from '../models/Budget.js';
import { claimNotification } from '../models/NotificationLog.js';
import { OVERALL } from '../utils/categories.js';
import { periodLabel, periodOf } from '../utils/dates.js';
import { getPeriodSpend } from './analytics.js';
import { enqueueEmail } from './email/outbox.js';
import { budgetAlertTemplate, largeExpenseTemplate } from './email/templates.js';

const LEVELS = [100, 80];

/**
 * Run after expenses are created/updated. Called WITHOUT await from the
 * request handler, so the user gets their response immediately and the
 * alert checks happen in the background.
 */
export function runExpenseAlerts(user, expenses) {
  checkAlerts(user, Array.isArray(expenses) ? expenses : [expenses]).catch((err) =>
    logger.error({ err, userId: String(user._id) }, 'expense alert check failed'),
  );
}

export async function checkAlerts(user, expenses) {
  if (!user.emailVerified || !expenses.length) return;
  const prefs = user.emailPrefs || {};

  if (prefs.largeExpense !== false && user.largeExpenseThresholdMinor > 0) {
    for (const exp of expenses) {
      if (exp.amountMinor >= user.largeExpenseThresholdMinor && (await claimNotification(user._id, `large:${exp._id}`))) {
        const tpl = largeExpenseTemplate({ name: user.name, expense: exp, thresholdMinor: user.largeExpenseThresholdMinor, currency: user.currency });
        await enqueueEmail({ userId: user._id, type: 'large_expense', to: user.email, ...tpl });
      }
    }
  }

  if (prefs.budgetAlerts !== false) {
    const periods = [...new Set(expenses.map((x) => periodOf(new Date(x.date), user.timezone)))];
    await checkBudgets(user, periods, [...new Set(expenses.map((x) => x.category))]);
  }
}

/** Email when a budget crosses 80% / 100% for the period (once per level per month). */
export async function checkBudgets(user, periods, categories) {
  if (!user.emailVerified || user.emailPrefs?.budgetAlerts === false) return;
  const budgets = await Budget.find({ userId: user._id, category: { $in: [OVERALL, ...categories] } }).lean();
  if (!budgets.length) return;

  for (const period of periods) {
    const spend = await getPeriodSpend(user, period);
    for (const b of budgets) {
      const spent = spend.get(b.category) || 0;
      const pct = (spent / b.limitMinor) * 100;
      const crossed = LEVELS.find((lvl) => pct >= lvl);
      if (!crossed) continue;

      // Claim this level AND every lower level, so jumping straight past 100%
      // sends one "exceeded" email - not an 80% email followed by a 100% one.
      const claims = await Promise.all(
        LEVELS.filter((l) => l <= crossed).map((l) => claimNotification(user._id, `budget:${b.category}:${period}:${l}`)),
      );
      if (!claims[0]) continue; // highest crossed level was already notified

      const tpl = budgetAlertTemplate({
        name: user.name,
        category: b.category,
        level: crossed,
        spentMinor: spent,
        limitMinor: b.limitMinor,
        currency: user.currency,
        periodLabel: periodLabel(period),
      });
      await enqueueEmail({ userId: user._id, type: `budget_${crossed}`, to: user.email, ...tpl });
    }
  }
}
