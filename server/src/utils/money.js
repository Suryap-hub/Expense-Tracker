/**
 * Money is stored as an integer number of minor units (paise for INR, cents
 * for USD). Never store or add rupees as floating point numbers:
 * 0.1 + 0.2 !== 0.3 in JavaScript, but 10 + 20 === 30 always.
 */

export const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
};
export const CURRENCY_CODES = Object.keys(CURRENCIES);

// 999,999,999.99 in major units - well inside Number.MAX_SAFE_INTEGER.
export const MAX_MINOR = 99_999_999_999;

const AMOUNT_RE = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/**
 * Convert "1,234.5" / 1234.5 / "₹ 99" into minor units (123450 / 9900).
 * Parses the decimal string directly instead of multiplying a float by 100.
 * Returns null when the value is not a valid positive amount.
 */
export function toMinor(input) {
  if (input === null || input === undefined) return null;
  let s;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    s = input.toFixed(2);
  } else if (typeof input === 'string') {
    s = input.replace(/[₹$€£,\s]|rs\.?|inr/gi, '');
  } else {
    return null;
  }
  const m = AMOUNT_RE.exec(s);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  if (minor <= 0 || minor > MAX_MINOR) return null;
  return minor;
}

/** 123450 -> "1234.50" (exact, string based). */
export function fromMinor(minor) {
  const neg = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** 123450, 'INR' -> "₹1,234.50" */
export function formatMoney(minor, currency = 'INR') {
  const c = CURRENCIES[currency] || CURRENCIES.INR;
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(fromMinor(minor)));
}

/** Percentage helper that never divides by zero. Returns null when base is 0. */
export function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
