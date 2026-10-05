import { useMemo, useState } from 'react';
import { money, moneyCompact } from '../../lib/format.js';
import { LegendKey, Tooltip, niceTicks, useWidth } from './common.jsx';

const H = 260;
const PAD = { top: 18, right: 92, bottom: 28, left: 52 };

/**
 * The dashboard's lead chart: cumulative spend this month vs last month at
 * the same day, with the end-of-month projection and the overall budget.
 * Answers "am I spending faster than usual?" at a glance.
 */
export default function PaceChart({ data, currency, projectedMinor, budgetMinor, daysElapsed, monthLabel, prevLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const days = data.length;
  const spent = data[daysElapsed - 1]?.cumulativeMinor ?? 0;
  const hasPrev = data.some((d) => d.prevCumulativeMinor > 0);

  const { top, ticks } = useMemo(() => {
    const max = Math.max(
      1,
      ...data.map((d) => d.cumulativeMinor || 0),
      ...data.map((d) => d.prevCumulativeMinor || 0),
      projectedMinor || 0,
      budgetMinor || 0,
    );
    return niceTicks(max * 1.05);
  }, [data, projectedMinor, budgetMinor]);

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (day) => PAD.left + ((day - 1) / Math.max(1, days - 1)) * innerW;
  const y = (v) => PAD.top + innerH - (v / top) * innerH;

  const thisPts = data.filter((d) => d.cumulativeMinor !== null).map((d) => [x(d.day), y(d.cumulativeMinor)]);
  const prevPts = data.filter((d) => d.prevCumulativeMinor !== null).map((d) => [x(d.day), y(d.prevCumulativeMinor)]);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = thisPts.length ? `${line(thisPts)}L${thisPts.at(-1)[0]},${y(0)}L${thisPts[0][0]},${y(0)}Z` : '';
  const lineLen = thisPts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - thisPts[i - 1][0], p[1] - thisPts[i - 1][1]) : 0), 0);
  const end = thisPts.at(-1);
  const showProjection = projectedMinor && daysElapsed < days && end;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const day = Math.min(days, Math.max(1, Math.round(((px - PAD.left) / innerW) * (days - 1)) + 1));
    setHover(day);
  }
  function onKey(e) {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(days, (h || daysElapsed || 1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(1, (h || daysElapsed || 1) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  }

  const hd = hover ? data[hover - 1] : null;
  const dateText = (d) => new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  // Right-margin labels (projection, budget): nudge apart when they'd overlap.
  const labels = [];
  if (showProjection) labels.push({ key: 'proj', y: y(projectedMinor), text: `${moneyCompact(projectedMinor, currency)} pace` });
  if (budgetMinor) labels.push({ key: 'budget', y: y(budgetMinor), text: `${moneyCompact(budgetMinor, currency)} budget` });
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendKey color="var(--chart-1)" label={monthLabel} />
        {hasPrev && <LegendKey color="var(--chart-prev)" label={prevLabel} />}
        {showProjection && <LegendKey color="var(--chart-1)" label="Projected" dotted />}
        {budgetMinor ? <LegendKey color="var(--ink-2)" label="Budget" /> : null}
        <button onClick={() => setShowTable((v) => !v)} className="ml-auto text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-[260px] overflow-auto rounded-[10px] ring-1 ring-line">
          <table className="w-full text-[13.5px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Spent that day</th>
                <th className="px-3 py-2 text-right font-medium">Running total</th>
                <th className="px-3 py-2 text-right font-medium">{prevLabel}</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {data.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-3 py-1.5">{dateText(d)}</td>
                  <td className="px-3 py-1.5 text-right">{d.totalMinor === null ? '-' : money(d.totalMinor, currency)}</td>
                  <td className="px-3 py-1.5 text-right">{d.cumulativeMinor === null ? '-' : money(d.cumulativeMinor, currency)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-2">{d.prevCumulativeMinor === null ? '-' : money(d.prevCumulativeMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height: H }}>
          {width > 0 && (
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={`Cumulative spending: ${money(spent, currency)} so far${projectedMinor ? `, on pace for ${money(projectedMinor, currency)}` : ''}. Use arrow keys to inspect days.`}
              tabIndex={0}
              onKeyDown={onKey}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
              className="touch-pan-y outline-none focus-visible:outline-2"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
                  <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-[var(--muted)] text-[11.5px]">
                    {moneyCompact(t, currency)}
                  </text>
                </g>
              ))}
              {[1, 8, 15, 22, days].map((d) => (
                <text key={d} x={x(d)} y={H - 8} textAnchor={d === 1 ? 'start' : d === days ? 'end' : 'middle'} className="tnum fill-[var(--muted)] text-[11.5px]">
                  {d}
                </text>
              ))}

              {budgetMinor ? <line x1={PAD.left} x2={PAD.left + innerW} y1={y(budgetMinor)} y2={y(budgetMinor)} stroke="var(--ink-2)" strokeOpacity="0.55" strokeWidth="1.5" /> : null}

              {hasPrev && <path d={line(prevPts)} fill="none" stroke="var(--chart-prev)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

              {area && <path d={area} fill="var(--chart-wash)" />}
              {showProjection && (
                <line x1={end[0]} y1={end[1]} x2={x(days)} y2={y(projectedMinor)} stroke="var(--chart-1)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 5" />
              )}
              {thisPts.length > 1 && (
                <path
                  d={line(thisPts)}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="draw-in"
                  style={{ '--len': Math.ceil(lineLen) + 1 }}
                />
              )}
              {end && <circle cx={end[0]} cy={end[1]} r="4.5" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="2" />}

              {labels.map((l) => (
                <text key={l.key} x={PAD.left + innerW + 8} y={l.y} dy="0.32em" paintOrder="stroke" stroke="var(--surface)" strokeWidth="4" className="fill-[var(--ink-2)] text-[12px]">
                  {l.text}
                </text>
              ))}
              {end && !hd && (() => {
                // Put the value beside the end dot, on whichever side has room.
                // Above-left of the dot; early in the month, pinned to the plot's left edge so it
                // never sits on the projection line rising to the right.
                const left = end[0] - PAD.left > 90;
                return (
                  <text x={left ? end[0] - 8 : PAD.left + 4} y={end[1] - 14} textAnchor={left ? 'end' : 'start'} paintOrder="stroke" stroke="var(--surface)" strokeWidth="4" strokeLinejoin="round" className="fill-[var(--ink)] text-[12.5px] font-semibold">
                    {money(spent, currency)}
                  </text>
                );
              })()}

              {hd && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--ink-2)" strokeOpacity="0.4" strokeWidth="1" />
                  {hd.prevCumulativeMinor !== null && hasPrev && (
                    <circle cx={x(hover)} cy={y(hd.prevCumulativeMinor)} r="4" fill="var(--chart-prev)" stroke="var(--surface)" strokeWidth="2" />
                  )}
                  {hd.cumulativeMinor !== null && <circle cx={x(hover)} cy={y(hd.cumulativeMinor)} r="4.5" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="2" />}
                </g>
              )}
            </svg>
          )}
          {hd && (
            <Tooltip
              x={x(hover)}
              y={PAD.top}
              width={width}
              title={dateText(hd)}
              rows={[
                ...(hd.cumulativeMinor !== null
                  ? [
                      { label: 'total so far', value: money(hd.cumulativeMinor, currency), color: 'var(--chart-1)' },
                      { label: 'that day', value: money(hd.totalMinor || 0, currency) },
                    ]
                  : []),
                ...(hasPrev && hd.prevCumulativeMinor !== null ? [{ label: prevLabel, value: money(hd.prevCumulativeMinor, currency), color: 'var(--chart-prev)' }] : []),
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
