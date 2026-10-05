import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { money } from '../../lib/format.js';
import { CategoryIcon } from '../ui.jsx';

/**
 * Ranked horizontal bars - one hue, because the bars encode magnitude, not
 * identity. The icon + name identify each row; the value sits at the tip.
 */
export function CategoryBars({ rows, currency, onSelect }) {
  const max = Math.max(1, ...rows.map((r) => r.totalMinor));
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const up = r.changePct !== null && r.changePct > 0;
        return (
          <li key={r.category}>
            <button
              onClick={() => onSelect?.(r.category)}
              className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-[10px] px-1 py-2 text-left hover:bg-surface-2"
              aria-label={`${r.category}: ${money(r.totalMinor, currency)}, ${r.sharePct}% of spending. View expenses.`}
            >
              <CategoryIcon category={r.category} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14.5px] font-medium">{r.category}</span>
                  <span className="tnum text-[12.5px] text-muted">{r.sharePct}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full">
                  <div className="h-2 rounded-r-[4px] bg-[var(--chart-1)]" style={{ width: `${Math.max(1.5, (r.totalMinor / max) * 100)}%` }} />
                </div>
              </div>
              <div className="w-[92px] text-right">
                <div className="tnum text-[14.5px] font-semibold">{money(r.totalMinor, currency)}</div>
                {r.changePct === 0 ? (
                  <div className="text-[12px] text-muted">same as last</div>
                ) : r.changePct !== null ? (
                  <div className={clsx('inline-flex items-center gap-0.5 text-[12px]', up ? 'text-critical-text' : 'text-good-text')}>
                    {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
                    {Math.abs(r.changePct)}% vs last
                  </div>
                ) : (
                  <div className="text-[12px] text-muted">new this month</div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const severity = (pct) => (pct >= 100 ? 'var(--critical)' : pct >= 80 ? 'var(--warning)' : 'var(--chart-1)');

/** Budget meter: fill color carries severity; status text repeats it in words. */
export function Meter({ pct }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="presentation">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: severity(pct) }} />
    </div>
  );
}
