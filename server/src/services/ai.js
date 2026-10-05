import { DateTime } from 'luxon';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { CATEGORIES, PAYMENT_METHODS, guessCategory } from '../utils/categories.js';
import { DATE_RE, todayISO } from '../utils/dates.js';
import { formatMoney, fromMinor, toMinor } from '../utils/money.js';
import { getOverview } from './analytics.js';
import { cached } from './cache.js';
import { groqChat } from './groq.js';

const MAX_DRAFTS = 25;
const SMS_HINT = /\b(debited|a\/c|acct|vpa|upi ref|txn|card ending|spent on your)\b/i;

const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** Clamp a model/heuristic date to a valid, non-future YYYY-MM-DD. */
function cleanDate(value, tz) {
  const today = todayISO(tz);
  if (typeof value !== 'string' || !DATE_RE.test(value)) return today;
  const dt = DateTime.fromISO(value, { zone: tz });
  if (!dt.isValid || value > today || dt.year < 2000) return today;
  return value;
}

/** Turn loose model output into a validated draft, or null if unusable. */
function toDraft(raw, tz, source) {
  const amountMinor = toMinor(typeof raw.amount === 'number' ? raw.amount : String(raw.amount ?? ''));
  if (!amountMinor) return null;
  const merchant = String(raw.merchant || '').trim().slice(0, 100) || 'Expense';
  const category = CATEGORIES.includes(raw.category) ? raw.category : guessCategory(merchant, raw.note) || 'Other';
  const paymentMethod = PAYMENT_METHODS.includes(raw.paymentMethod) ? raw.paymentMethod : 'UPI';
  return {
    amountMinor,
    amount: fromMinor(amountMinor),
    merchant,
    category,
    paymentMethod,
    date: cleanDate(raw.date, tz),
    note: String(raw.note || '').trim().slice(0, 500),
    source,
  };
}

// ---------------------------------------------------------------------------
// Natural language / SMS -> expense drafts
// ---------------------------------------------------------------------------

export async function parseExpenses(user, text) {
  const tz = user.timezone || 'Asia/Kolkata';
  const source = SMS_HINT.test(text) ? 'sms' : 'ai';

  if (env.aiEnabled) {
    try {
      const drafts = await parseWithGroq(user, text, tz, source);
      return { drafts, engine: 'groq' };
    } catch (err) {
      logger.warn({ err: err.message }, 'groq parse failed, using basic parser');
      return { drafts: basicParse(text, tz, source), engine: 'basic', warning: 'AI was unavailable, so a basic parser was used. Double-check the details.' };
    }
  }
  return { drafts: basicParse(text, tz, source), engine: 'basic' };
}

async function parseWithGroq(user, text, tz, source) {
  const now = DateTime.now().setZone(tz);
  const system = [
    'You convert short notes and Indian bank/UPI/card SMS messages into expense records.',
    'Rules:',
    '- Only include money the user SPENT (debits, payments, purchases). Skip credits, refunds, salary, cashback, OTPs, balance-only and promotional messages.',
    `- amount: positive number in ${user.currency} major units, e.g. 450.5. No symbols or commas.`,
    "- merchant: short clean payee name in Title Case, e.g. 'Swiggy', 'Uber', 'Sharma Kirana'. For UPI VPAs like swiggy.order@icici use the readable part before @. If no payee is known, a 2-4 word description like 'Lunch'.",
    `- category: exactly one of ${JSON.stringify(CATEGORIES)}.`,
    `- paymentMethod: exactly one of ${JSON.stringify(PAYMENT_METHODS)}. UPI/VPA -> "UPI", card -> "Card", default "UPI".`,
    `- date: YYYY-MM-DD. Today is ${now.toISODate()} (${now.toFormat('cccc')}). Resolve relative dates like "yesterday" or "last friday". SMS dates are day-first (05-10-26 = 2026-10-05). No date -> today.`,
    '- note: short extra detail worth keeping, otherwise "".',
    '- One record per distinct expense: "lunch 200 and cab 150" is two records.',
    'Reply with JSON only: {"expenses":[{"amount":0,"merchant":"","category":"","paymentMethod":"","date":"","note":""}]}',
  ].join('\n');

  const out = await groqChat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
    maxTokens: 1500,
  });
  const list = Array.isArray(out?.expenses) ? out.expenses : [];
  return list.slice(0, MAX_DRAFTS).map((r) => toDraft(r, tz, source)).filter(Boolean);
}

/** Offline regex parser: works with no API key. Handles one expense per line/clause. */
export function basicParse(text, tz = 'Asia/Kolkata', source = 'ai') {
  const today = DateTime.now().setZone(tz);
  const chunks = text
    .split(/\n+|;|\band\b|,(?!\d)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const drafts = [];
  for (const chunk of chunks) {
    if (/\bcredited\b/i.test(chunk) && !/\bdebited\b/i.test(chunk)) continue;
    if (/\botp\b/i.test(chunk)) continue;

    const amt =
      chunk.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] ??
      chunk.match(/(?<![\d/-])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?![\d/-])/)?.[0];
    const amountMinor = toMinor(amt ?? '');
    if (!amountMinor) continue;

    let date = today;
    if (/\byesterday\b/i.test(chunk)) date = today.minus({ days: 1 });
    const dm = chunk.match(/\b(\d{1,2})[-/](\d{1,2}|[a-z]{3})[-/](\d{2,4})\b/i);
    if (dm) {
      const yr = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
      const parsed = /^\d+$/.test(dm[2])
        ? DateTime.fromObject({ day: +dm[1], month: +dm[2], year: +yr }, { zone: tz })
        : DateTime.fromFormat(`${dm[1]}-${dm[2]}-${yr}`, 'd-LLL-yyyy', { zone: tz });
      if (parsed.isValid) date = parsed;
    }

    const vpa = chunk.match(/(?:to|vpa)\s+([a-z0-9._-]+)@[a-z]+/i)?.[1];
    let merchant = vpa ? vpa.split(/[._-]/)[0] : '';
    if (!merchant) {
      const after = chunk.match(/\b(?:at|to|from)\s+([a-z][a-z0-9&' ]{1,40}?)(?=\s+(?:on|for|via|rs|inr|₹|\d)|$)/i)?.[1];
      merchant =
        after ||
        chunk
          .replace(/(?:rs\.?|inr|₹)\s*[\d,.]+/gi, ' ')
          .replace(/\b\d[\d,./-]*\b/g, ' ')
          .replace(/\b(spent|paid|pay|for|on|rs|inr|rupees|today|yesterday|via|using|upi|card|cash|debited|from|a\/c|xx\w*)\b/gi, ' ')
          .slice(0, 40);
    }
    merchant = titleCase(merchant) || 'Expense';

    const pm = /\b(upi|vpa)\b/i.test(chunk) ? 'UPI' : /\bcard\b/i.test(chunk) ? 'Card' : /\bcash\b/i.test(chunk) ? 'Cash' : 'UPI';
    drafts.push(toDraft({ amount: fromMinor(amountMinor), merchant, category: guessCategory(chunk), paymentMethod: pm, date: date.toISODate() }, tz, source));
    if (drafts.length >= MAX_DRAFTS) break;
  }
  return drafts.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Category suggestion
// ---------------------------------------------------------------------------

export async function suggestCategory(merchant, note = '') {
  const rule = guessCategory(merchant, note);
  if (rule) return { category: rule, engine: 'rules' };
  if (!env.aiEnabled) return { category: 'Other', engine: 'rules' };
  try {
    const out = await groqChat({
      messages: [
        { role: 'system', content: `Classify an expense into exactly one of ${JSON.stringify(CATEGORIES)}. Reply as JSON: {"category":"..."}` },
        { role: 'user', content: `Payee: ${merchant}\nNote: ${note}` },
      ],
      maxTokens: 40,
      timeoutMs: 5000,
    });
    return { category: CATEGORIES.includes(out?.category) ? out.category : 'Other', engine: 'groq' };
  } catch {
    return { category: 'Other', engine: 'rules' };
  }
}

// ---------------------------------------------------------------------------
// Spending insights
// ---------------------------------------------------------------------------

const insightsSchema = z.object({
  headline: z.string().min(1).max(200),
  insights: z
    .array(
      z.object({
        type: z.enum(['warning', 'tip', 'positive', 'info']).catch('info'),
        title: z.string().min(1).max(90),
        detail: z.string().min(1).max(320),
      }),
    )
    .max(6),
});

export function getInsights(user, period) {
  return cached(user._id, `insights:${period}`, 30 * 60_000, async () => {
    const overview = await getOverview(user, period);
    if (overview.totals.txCount === 0) {
      return { period, engine: 'rules', headline: 'No expenses recorded for this month yet.', insights: [] };
    }
    if (env.aiEnabled) {
      try {
        return { period, engine: 'groq', ...(await insightsWithGroq(user, overview)) };
      } catch (err) {
        logger.warn({ err: err.message }, 'groq insights failed, using rules');
      }
    }
    return { period, engine: 'rules', ...ruleInsights(user, overview) };
  });
}

async function insightsWithGroq(user, o) {
  const m = (x) => formatMoney(x, user.currency);
  // Send only aggregates - never raw notes - to keep the prompt small (fast)
  // and avoid sharing more personal data than needed.
  const facts = {
    month: o.periodLabel,
    monthInProgress: o.isCurrent,
    daysElapsed: o.totals.daysElapsed,
    daysInMonth: o.totals.daysInMonth,
    spent: m(o.totals.spentMinor),
    previousMonthTotal: m(o.totals.prevSpentMinor),
    previousMonthSamePoint: o.isCurrent ? m(o.totals.prevToDateMinor) : undefined,
    projectedMonthTotal: o.totals.projectedMinor ? m(o.totals.projectedMinor) : undefined,
    transactions: o.totals.txCount,
    averagePerDay: m(o.totals.avgPerDayMinor),
    categories: o.byCategory.map((c) => ({ category: c.category, spent: m(c.totalMinor), share: `${c.sharePct}%`, previousMonth: m(c.prevMinor), count: c.count })),
    budgets: o.budgets.map((b) => ({ category: b.category, limit: m(b.limitMinor), spent: m(b.spentMinor), used: `${b.pct}%` })),
    topMerchants: o.topMerchants.map((t) => ({ merchant: t.merchant, spent: m(t.totalMinor), visits: t.count })),
    spendByWeekday: o.weekday.map((w) => ({ day: w.day, spent: m(w.totalMinor) })),
    paymentMethods: o.byPaymentMethod.map((p) => ({ method: p.paymentMethod, spent: m(p.totalMinor) })),
  };

  const out = await groqChat({
    model: env.GROQ_INSIGHTS_MODEL,
    temperature: 0.4,
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content: [
          'You are a friendly, sharp personal finance coach for a user in India.',
          'Given monthly spending aggregates, write 3-5 specific insights. Use the actual numbers and merchant/category names.',
          'Mix: notable patterns, budget risks, concrete savings ideas with an estimated monthly saving, and one positive note if deserved.',
          'If the month is in progress, compare against the previous month at the same point, not the full previous month.',
          'Never invent numbers that are not derivable from the data. No generic advice like "make a budget" unless tied to the data.',
          'Reply with JSON only: {"headline":"one sentence summary","insights":[{"type":"warning|tip|positive|info","title":"max 8 words","detail":"1-2 sentences"}]}',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify(facts) },
    ],
  });
  return insightsSchema.parse(out);
}

export function ruleInsights(user, o) {
  const m = (x) => formatMoney(x, user.currency);
  const insights = [];
  const top = o.byCategory[0];
  if (top) {
    insights.push({ type: 'info', title: `${top.category} leads your spending`, detail: `${m(top.totalMinor)} across ${top.count} ${top.count === 1 ? 'transaction' : 'transactions'}, ${top.sharePct}% of the month.` });
  }
  for (const b of o.budgets.filter((x) => x.pct >= 80).slice(0, 2)) {
    insights.push({
      type: 'warning',
      title: b.pct >= 100 ? `${b.category} budget exceeded` : `${b.category} budget nearly used`,
      detail: `${m(b.spentMinor)} of ${m(b.limitMinor)} used (${b.pct}%).`,
    });
  }
  const riser = o.byCategory.filter((c) => c.changePct !== null && c.changePct >= 25 && c.prevMinor > 0).sort((a, b) => b.changePct - a.changePct)[0];
  if (riser) insights.push({ type: 'warning', title: `${riser.category} is up ${riser.changePct}%`, detail: `${m(riser.totalMinor)} vs ${m(riser.prevMinor)} last month.` });
  const merchant = o.topMerchants.find((t) => t.count >= 4);
  if (merchant) {
    insights.push({
      type: 'tip',
      title: `Frequent spend at ${merchant.merchant}`,
      detail: `${merchant.count} payments totalling ${m(merchant.totalMinor)}. Cutting a quarter of these would save about ${m(Math.round(merchant.totalMinor / 4))}.`,
    });
  }
  const change = o.totals.changeToDatePct;
  if (change !== null && change < 0) insights.push({ type: 'positive', title: 'Spending is down', detail: `You're ${Math.abs(change)}% below last month at the same point.` });

  const headline = o.totals.projectedMinor
    ? `You've spent ${m(o.totals.spentMinor)} so far and are on track for about ${m(o.totals.projectedMinor)} this month.`
    : `You spent ${m(o.totals.spentMinor)} in ${o.periodLabel}.`;
  return { headline, insights: insights.slice(0, 5) };
}
