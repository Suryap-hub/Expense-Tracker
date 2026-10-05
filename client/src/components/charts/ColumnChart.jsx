import { useState } from 'react';
import { money, moneyCompact } from '../../lib/format.js';
import { Tooltip, columnPath, niceTicks, useWidth } from './common.jsx';

/**
 * Single-series column chart. Every column uses the de-emphasis grey except
 * the highlighted one (the current month / busiest day), which takes the
 * accent and the only direct value label.
 */
export default function ColumnChart({ data, currency, highlightIndex, height = 180, ariaLabel, valueLabel = 'spent' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { top: 22, right: 4, bottom: 26, left: 44 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const { top, ticks } = niceTicks(Math.max(...data.map((d) => d.value), 0), 3);
  const band = innerW / data.length;
  const barW = Math.min(24, band * 0.62);
  const y = (v) => pad.top + innerH - (v / top) * innerH;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-[var(--muted)] text-[11px]">
                {moneyCompact(t, currency)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2;
            const h = (d.value / top) * innerH;
            const hi = i === highlightIndex;
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.title || d.label}: ${money(d.value, currency)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                {/* hit target wider than the mark */}
                <rect x={cx - band / 2} y={pad.top} width={band} height={innerH} fill="transparent" />
                <path
                  d={columnPath(cx - barW / 2, y(d.value), barW, h)}
                  fill={hi ? 'var(--chart-1)' : 'var(--chart-prev)'}
                  opacity={hover === null || hover === i ? 1 : 0.6}
                />
                {hi && d.value > 0 && (
                  <text x={cx} y={y(d.value) - 7} textAnchor="middle" className="tnum fill-[var(--ink)] text-[11.5px] font-semibold">
                    {moneyCompact(d.value, currency)}
                  </text>
                )}
                <text x={cx} y={height - 8} textAnchor="middle" className={`text-[11.5px] ${hi ? 'fill-[var(--ink)] font-medium' : 'fill-[var(--muted)]'}`}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <Tooltip
          x={pad.left + band * hover + band / 2}
          y={0}
          width={width}
          title={data[hover].title || data[hover].label}
          rows={[
            { label: valueLabel, value: money(data[hover].value, currency) },
            ...(data[hover].count !== undefined ? [{ label: data[hover].count === 1 ? 'expense' : 'expenses', value: data[hover].count }] : []),
          ]}
        />
      )}
    </div>
  );
}
