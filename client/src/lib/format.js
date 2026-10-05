const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };
const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export const currencySymbol = (c = 'INR') => SYMBOLS[c] || c;

/** Minor units -> "₹1,234.50" (decimals dropped when they're zero). */
export function money(minor, currency = 'INR', { decimals } = {}) {
  if (minor === null || minor === undefined) return '-';
  const value = minor / 100;
  const hasPaise = minor % 100 !== 0;
  return new Intl.NumberFormat(LOCALES[currency] || 'en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ?? (hasPaise ? 2 : 0),
    maximumFractionDigits: decimals ?? 2,
  }).format(value);
}

/** Compact for axis ticks: ₹12.5K, ₹1.2L (Indian lakh for INR). */
export function moneyCompact(minor, currency = 'INR') {
  const v = minor / 100;
  const s = currencySymbol(currency);
  const abs = Math.abs(v);
  const trim = (n) => n.toFixed(1).replace(/\.0$/, '');
  if (currency === 'INR') {
    if (abs >= 1e7) return `${s}${trim(v / 1e7)}Cr`;
    if (abs >= 1e5) return `${s}${trim(v / 1e5)}L`;
  }
  if (abs >= 1e6) return `${s}${trim(v / 1e6)}M`;
  if (abs >= 1e3) return `${s}${trim(v / 1e3)}K`;
  return `${s}${Math.round(v)}`;
}

/** Minor units -> plain "1234.50" string for form inputs. */
export const toInput = (minor) => (minor / 100).toFixed(2).replace(/\.00$/, '');

export function pct(n) {
  if (n === null || n === undefined) return '-';
  return `${n > 0 ? '+' : ''}${n}%`;
}

export function dateLabel(iso, tz) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: tz });
}

export function dateLong(iso, tz) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
}

/** Calendar date (YYYY-MM-DD) of an instant in the user's timezone. */
export function isoDateIn(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function todayIn(tz) {
  return isoDateIn(new Date().toISOString(), tz);
}

export function currentPeriod(tz) {
  return todayIn(tz).slice(0, 7);
}

export function shiftPeriod(period, n) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function relativeDay(iso, tz) {
  const d = isoDateIn(iso, tz);
  const today = todayIn(tz);
  const yesterday = isoDateIn(new Date(Date.now() - 86_400_000).toISOString(), tz);
  if (d === today) return 'Today';
  if (d === yesterday) return 'Yesterday';
  return dateLong(iso, tz);
}
