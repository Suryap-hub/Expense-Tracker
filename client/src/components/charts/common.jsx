import { useEffect, useRef, useState } from 'react';

/** Track an element's width so SVG charts can render crisp at any size. */
export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Round an axis maximum up to a clean number with `count` even steps. */
export function niceTicks(max, count = 4) {
  if (!max || max <= 0) return { top: count, ticks: Array.from({ length: count + 1 }, (_, i) => i) };
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  const top = step * count;
  return { top, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) };
}

/** Column path: 4px rounded data-end, square at the baseline. */
export function columnPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Floating tooltip: values lead, labels follow, line keys mark series. */
export function Tooltip({ x, y, width, title, rows }) {
  if (x === null || x === undefined) return null;
  const flip = x > width - 190;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[150px] rounded-[10px] bg-surface px-3 py-2.5 text-[13px] shadow-lg ring-1 ring-line"
      style={{ left: flip ? undefined : x + 14, right: flip ? width - x + 14 : undefined, top: Math.max(0, y) }}
    >
      <div className="mb-1.5 text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          {r.color && (
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded"
              style={{ background: r.dashed ? `repeating-linear-gradient(90deg, ${r.color} 0 3px, transparent 3px 5px)` : r.color }}
            />
          )}
          <span className="tnum font-semibold text-ink">{r.value}</span>
          <span className="text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LegendKey({ color, label, dashed, dotted }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <svg width="16" height="4" aria-hidden>
        <line
          x1="1"
          y1="2"
          x2="15"
          y2="2"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dotted ? '0.1 4' : dashed ? '4 3' : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
