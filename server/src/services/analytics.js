import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Budget from '../models/Budget.js';
import Expense from '../models/Expense.js';
import { OVERALL } from '../utils/categories.js';
import { currentPeriod, periodLabel, periodRange, shiftPeriod } from '../utils/dates.js';
import { pctChange } from '../utils/money.js';
import { cached } from './cache.js';

const TREND_MONTHS = 6;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Everything the dashboard needs for one month, computed in ONE aggregation
 * round trip using $facet (plus the budgets lookup in parallel). Results are
 * cached per user until their next write.
 */
export function getOverview(user, period) {
  return cached(user._id, `overview:${period}`, 5 * 60_000, () => computeOverview(user, period));
}

async function computeOverview(user, period) {
  const tz = user.timezone || 'Asia/Kolkata';
  const uid = new mongoose.Types.ObjectId(String(user._id));
  const { start, end, daysInMonth } = periodRange(period, tz);
  const prevPeriod = shiftPeriod(period, -1);
  const { start: prevStart, daysInMonth: prevDays } = periodRange(prevPeriod, tz);
  const { start: trendStart } = periodRange(shiftPeriod(period, -(TREND_MONTHS - 1)), tz);
  const day = (field = '$date') => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz } });
  const inMonth = { $match: { date: { $gte: start } } };
  const inPrevMonth = { $match: { date: { $gte: prevStart, $lt: start } } };

  const [[agg], budgets] = await Promise.all([
    Expense.aggregate([
      { $match: { userId: uid, date: { $gte: trendStart, $lt: end } } },
      {
        $facet: {
          trend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } },
                totalMinor: { $sum: '$amountMinor' },
                count: { $sum: 1 },
              },
            },
          ],
          byCategory: [inMonth, { $group: { _id: '$category', totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }, { $sort: { totalMinor: -1 } }],
          prevByCategory: [inPrevMonth, { $group: { _id: '$category', totalMinor: { $sum: '$amountMinor' } } }],
          daily: [inMonth, { $group: { _id: day(), totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }],
          prevDaily: [inPrevMonth, { $group: { _id: day(), totalMinor: { $sum: '$amountMinor' } } }],
          weekday: [inMonth, { $group: { _id: { $dayOfWeek: { date: '$date', timezone: tz } }, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }],
          byPayment: [inMonth, { $group: { _id: '$paymentMethod', totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }, { $sort: { totalMinor: -1 } }],
          topMerchants: [
            inMonth,
            { $group: { _id: { $toLower: '$merchant' }, merchant: { $first: '$merchant' }, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
            { $sort: { totalMinor: -1 } },
            { $limit: 6 },
          ],
          largest: [
            inMonth,
            { $sort: { amountMinor: -1 } },
            { $limit: 5 },
            { $project: { _id: 1, merchant: 1, category: 1, amountMinor: 1, date: 1, paymentMethod: 1 } },
          ],
        },
      },
    ]),
    Budget.find({ userId: uid }).lean(),
  ]);

  // ----- time bookkeeping ---------------------------------------------------
  const now = DateTime.now().setZone(tz);
  const nowPeriod = currentPeriod(tz);
  const isCurrent = period === nowPeriod;
  const isFuture = period > nowPeriod;
  const daysElapsed = isFuture ? 0 : isCurrent ? now.day : daysInMonth;

  // ----- monthly trend (fill months with no spending) ------------------------
  const trendMap = new Map(agg.trend.map((t) => [t._id, t]));
  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const p = shiftPeriod(period, i - (TREND_MONTHS - 1));
    return { period: p, label: DateTime.fromFormat(p, 'yyyy-MM').toFormat('LLL'), totalMinor: trendMap.get(p)?.totalMinor || 0, count: trendMap.get(p)?.count || 0 };
  });
  const spentMinor = trendMap.get(period)?.totalMinor || 0;
  const txCount = trendMap.get(period)?.count || 0;
  const prevSpentMinor = trendMap.get(prevPeriod)?.totalMinor || 0;

  // ----- daily + cumulative, with last month overlaid for comparison --------
  const dailyMap = new Map(agg.daily.map((d) => [d._id, d]));
  const prevDailyMap = new Map(agg.prevDaily.map((d) => [d._id, d.totalMinor]));
  const monthStart = DateTime.fromFormat(period, 'yyyy-MM', { zone: tz });
  const prevMonthStart = DateTime.fromFormat(prevPeriod, 'yyyy-MM', { zone: tz });
  let cum = 0;
  let prevCum = 0;
  let prevToDateMinor = 0;
  const daily = Array.from({ length: daysInMonth }, (_, i) => {
    const date = monthStart.plus({ days: i }).toISODate();
    const totalMinor = dailyMap.get(date)?.totalMinor || 0;
    cum += totalMinor;
    if (i < prevDays) prevCum += prevDailyMap.get(prevMonthStart.plus({ days: i }).toISODate()) || 0;
    if (i + 1 === daysElapsed) prevToDateMinor = prevCum;
    const future = i + 1 > daysElapsed;
    return {
      date,
      day: i + 1,
      totalMinor: future ? null : totalMinor,
      count: dailyMap.get(date)?.count || 0,
      cumulativeMinor: future ? null : cum,
      prevCumulativeMinor: i < prevDays ? prevCum : null,
    };
  });

  // ----- categories ----------------------------------------------------------
  const prevCat = new Map(agg.prevByCategory.map((c) => [c._id, c.totalMinor]));
  const byCategory = agg.byCategory.map((c) => ({
    category: c._id,
    totalMinor: c.totalMinor,
    count: c.count,
    sharePct: spentMinor ? Math.round((c.totalMinor / spentMinor) * 1000) / 10 : 0,
    prevMinor: prevCat.get(c._id) || 0,
    changePct: pctChange(c.totalMinor, prevCat.get(c._id) || 0),
  }));
  const catSpend = new Map(byCategory.map((c) => [c.category, c.totalMinor]));

  // ----- budgets -------------------------------------------------------------
  const budgetRows = budgets
    .map((b) => {
      const spent = b.category === OVERALL ? spentMinor : catSpend.get(b.category) || 0;
      return {
        category: b.category,
        limitMinor: b.limitMinor,
        spentMinor: spent,
        remainingMinor: b.limitMinor - spent,
        pct: Math.round((spent / b.limitMinor) * 1000) / 10,
      };
    })
    .sort((a, b) => (a.category === OVERALL ? -1 : b.category === OVERALL ? 1 : b.pct - a.pct));

  const wdMap = new Map(agg.weekday.map((w) => [w._id, w]));
  const weekday = [2, 3, 4, 5, 6, 7, 1].map((d) => ({ day: DOW[d - 1], totalMinor: wdMap.get(d)?.totalMinor || 0, count: wdMap.get(d)?.count || 0 }));

  return {
    period,
    periodLabel: periodLabel(period),
    currency: user.currency,
    isCurrent,
    totals: {
      spentMinor,
      prevSpentMinor,
      changePct: pctChange(spentMinor, prevSpentMinor),
      prevToDateMinor,
      changeToDatePct: isCurrent ? pctChange(spentMinor, prevToDateMinor) : pctChange(spentMinor, prevSpentMinor),
      txCount,
      daysElapsed,
      daysInMonth,
      avgPerDayMinor: daysElapsed ? Math.round(spentMinor / daysElapsed) : 0,
      projectedMinor: isCurrent && daysElapsed ? projectMonth(daily.slice(0, daysElapsed).map((d) => d.totalMinor), spentMinor, daysInMonth) : null,
    },
    trend,
    daily,
    byCategory,
    byPaymentMethod: agg.byPayment.map((p) => ({ paymentMethod: p._id, totalMinor: p.totalMinor, count: p.count })),
    weekday,
    topMerchants: agg.topMerchants.map((m) => ({ merchant: m.merchant, totalMinor: m.totalMinor, count: m.count })),
    largest: agg.largest.map((x) => ({ id: String(x._id), merchant: x.merchant, category: x.category, amountMinor: x.amountMinor, date: x.date, paymentMethod: x.paymentMethod })),
    budgets: budgetRows,
  };
}

/**
 * End-of-month estimate = spent so far + remaining days x typical daily spend.
 * "Typical" is a winsorized mean: any day above 3x the median day is capped,
 * so a one-off like rent on the 1st isn't treated as a daily habit.
 * (Plain spent/daysElapsed x daysInMonth would predict rent ~30 times.)
 */
export function projectMonth(dailyMinor, spentMinor, daysInMonth) {
  const n = dailyMinor.length;
  if (!n) return spentMinor;
  const sorted = [...dailyMinor].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const cap = median > 0 ? median * 3 : Infinity;
  const typical = dailyMinor.reduce((s, v) => s + Math.min(v, cap), 0) / n;
  return Math.round(spentMinor + typical * (daysInMonth - n));
}

/** Spend per category (plus Overall) for one period. Used by budget alerts. */
export async function getPeriodSpend(user, period) {
  const { start, end } = periodRange(period, user.timezone || 'Asia/Kolkata');
  const rows = await Expense.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(user._id)), date: { $gte: start, $lt: end } } },
    { $group: { _id: '$category', totalMinor: { $sum: '$amountMinor' } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r.totalMinor]));
  map.set(OVERALL, rows.reduce((s, r) => s + r.totalMinor, 0));
  return map;
}
