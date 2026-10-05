import { DateTime, IANAZone } from 'luxon';

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isValidTimezone = (tz) => typeof tz === 'string' && IANAZone.isValidZone(tz);

/** Current "YYYY-MM" in the given timezone. */
export function currentPeriod(tz = 'Asia/Kolkata') {
  return DateTime.now().setZone(tz).toFormat('yyyy-MM');
}

/** shiftPeriod('2026-01', -1) -> '2025-12' */
export function shiftPeriod(period, months) {
  return DateTime.fromFormat(period, 'yyyy-MM', { zone: 'utc' }).plus({ months }).toFormat('yyyy-MM');
}

/** UTC instants bounding a month in the user's timezone: [start, end). */
export function periodRange(period, tz = 'Asia/Kolkata') {
  const start = DateTime.fromFormat(period, 'yyyy-MM', { zone: tz }).startOf('month');
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate(), daysInMonth: start.daysInMonth };
}

export function periodLabel(period) {
  return DateTime.fromFormat(period, 'yyyy-MM').toFormat('LLLL yyyy');
}

/** Period ("YYYY-MM") that a Date falls in, in the user's timezone. */
export function periodOf(date, tz = 'Asia/Kolkata') {
  return DateTime.fromJSDate(date).setZone(tz).toFormat('yyyy-MM');
}

/** Start of a calendar day (YYYY-MM-DD) in tz, as a Date. */
export function dayStart(ymd, tz = 'Asia/Kolkata') {
  return DateTime.fromISO(ymd, { zone: tz }).startOf('day').toJSDate();
}

/** Start of the day *after* ymd in tz (exclusive upper bound). */
export function dayEnd(ymd, tz = 'Asia/Kolkata') {
  return DateTime.fromISO(ymd, { zone: tz }).startOf('day').plus({ days: 1 }).toJSDate();
}

/**
 * Turn user input into the instant to store.
 * - "2026-10-05" (date only): if it's today -> now, otherwise noon local time,
 *   so the expense stays on the right calendar day in every timezone view.
 * - full ISO datetime: used as-is.
 * Future dates are clamped to "now" (you can't have spent money tomorrow).
 */
export function resolveExpenseDate(input, tz = 'Asia/Kolkata') {
  const now = DateTime.now().setZone(tz);
  if (!input) return now.toJSDate();
  let dt;
  if (DATE_RE.test(input)) {
    dt = DateTime.fromISO(input, { zone: tz });
    if (!dt.isValid) return null;
    dt = dt.hasSame(now, 'day') ? now : dt.set({ hour: 12 });
  } else {
    dt = DateTime.fromISO(input, { setZone: true });
    if (!dt.isValid) return null;
  }
  if (dt > now.plus({ minutes: 5 })) dt = now;
  if (dt.year < 2000) return null;
  return dt.toJSDate();
}

export function todayISO(tz = 'Asia/Kolkata') {
  return DateTime.now().setZone(tz).toISODate();
}
