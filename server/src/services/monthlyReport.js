import logger from '../config/logger.js';
import { claimNotification } from '../models/NotificationLog.js';
import User from '../models/User.js';
import { currentPeriod, shiftPeriod } from '../utils/dates.js';
import { formatMoney } from '../utils/money.js';
import { getOverview } from './analytics.js';
import { enqueueEmail } from './email/outbox.js';
import { monthlySummaryTemplate } from './email/templates.js';

export async function buildMonthlyReport(user, period) {
  const o = await getOverview(user, period);
  const money = (m) => formatMoney(m, user.currency);
  const highlights = [];

  if (o.byCategory[0]) {
    const top = o.byCategory[0];
    highlights.push(`${top.category} was your biggest category at ${money(top.totalMinor)} (${top.sharePct}% of spending).`);
  }
  const riser = o.byCategory.filter((c) => c.changePct !== null && c.prevMinor >= 50_000).sort((a, b) => b.changePct - a.changePct)[0];
  if (riser && riser.changePct >= 20) {
    highlights.push(`${riser.category} spending rose ${riser.changePct}% vs the previous month.`);
  }
  const busiest = [...o.weekday].sort((a, b) => b.totalMinor - a.totalMinor)[0];
  const FULL = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' };
  if (busiest?.totalMinor) highlights.push(`You spent the most on ${FULL[busiest.day]}.`);
  const over = o.budgets.filter((b) => b.pct >= 100);
  if (over.length) highlights.push(`Over budget in: ${over.map((b) => b.category).join(', ')}.`);
  if (o.totals.txCount) highlights.push(`Average daily spend: ${money(Math.round(o.totals.avgPerDayMinor / 100) * 100)}.`);

  return {
    currency: user.currency,
    period,
    periodLabel: o.periodLabel,
    totals: o.totals,
    byCategory: o.byCategory,
    topExpenses: o.largest,
    budgets: o.budgets,
    highlights,
  };
}

/**
 * Queue the monthly summary email for one user. Deduplicated per period so a
 * retried cron run never double-sends; `force` skips the dedupe (used by the
 * "Email me my report" button).
 */
export async function sendMonthlyReport(user, period, { force = false } = {}) {
  if (!force && !(await claimNotification(user._id, `monthly:${period}`))) return false;
  const report = await buildMonthlyReport(user, period);
  if (!force && report.totals.txCount === 0) return false; // nothing to report
  const tpl = monthlySummaryTemplate({ name: user.name, report });
  await enqueueEmail({ userId: user._id, type: 'monthly_summary', to: user.email, ...tpl });
  return true;
}

/**
 * Send last month's summary to every opted-in, verified user. Streams users
 * with a cursor so memory stays flat no matter how many users there are.
 */
export async function runMonthlyReports({ period } = {}) {
  const started = Date.now();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const cursor = User.find({ emailVerified: true, 'emailPrefs.monthlySummary': { $ne: false } }).lean().cursor();
  for await (const user of cursor) {
    try {
      const p = period || shiftPeriod(currentPeriod(user.timezone), -1);
      (await sendMonthlyReport(user, p)) ? sent++ : skipped++;
    } catch (err) {
      failed++;
      logger.error({ err, userId: String(user._id) }, 'monthly report failed');
    }
  }
  const result = { sent, skipped, failed, ms: Date.now() - started };
  logger.info(result, 'monthly reports run complete');
  return result;
}
