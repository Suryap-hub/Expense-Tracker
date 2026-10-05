import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { CategoryBars, Meter } from '../components/charts/BarList.jsx';
import ColumnChart from '../components/charts/ColumnChart.jsx';
import PaceChart from '../components/charts/PaceChart.jsx';
import { useExpenseForm } from '../components/Layout.jsx';
import { BudgetStatus, Button, CategoryIcon, ErrorNote, MonthSwitcher, SectionTitle, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { currentPeriod, dateLabel, money, periodLabel, shiftPeriod } from '../lib/format.js';

const monthName = (p) => periodLabel(p).split(' ')[0];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const openForm = useExpenseForm();
  const nowPeriod = currentPeriod(user.timezone);
  const [period, setPeriod] = useState(nowPeriod);

  const overview = useQuery({
    queryKey: ['overview', period],
    queryFn: () => api(`/analytics/overview?period=${period}`),
    placeholderData: keepPreviousData,
  });
  const recent = useQuery({ queryKey: ['expenses', 'recent'], queryFn: () => api('/expenses?limit=6') });

  if (overview.isPending) {
    return (
      <div className="grid h-[60vh] place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (overview.isError) return <ErrorNote error={overview.error} />;

  const o = overview.data;
  const cur = o.currency;
  const t = o.totals;
  const overall = o.budgets.find((b) => b.category === 'Overall');
  const categoryBudgets = o.budgets.filter((b) => b.category !== 'Overall');
  const [y, m] = period.split('-');
  const lastDay = String(t.daysInMonth).padStart(2, '0');
  const openCategory = (category) =>
    navigate(`/expenses?category=${encodeURIComponent(category)}&from=${y}-${m}-01&to=${y}-${m}-${lastDay}`);
  const prevName = monthName(shiftPeriod(period, -1));
  const compareBase = o.isCurrent ? t.prevToDateMinor : t.prevSpentMinor;
  const diff = t.spentMinor - compareBase;
  const neverUsed = t.txCount === 0 && o.trend.every((x) => x.totalMinor === 0);

  return (
    <div className={clsx('transition-opacity', overview.isFetching && overview.isPlaceholderData && 'opacity-60')}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Hi {user.name.split(' ')[0]}</h1>
        <MonthSwitcher period={period} onChange={setPeriod} max={nowPeriod} />
      </div>

      {neverUsed ? (
        <Welcome onAdd={() => openForm()} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {/* ---------------- hero: the pace of this month */}
          <section className="grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(240px,300px)_1fr]">
            <div className="flex flex-col">
              <p className="text-[14px] text-ink-2">{o.isCurrent ? `Spent so far in ${monthName(period)}` : `Spent in ${periodLabel(period)}`}</p>
              <p className="mt-1 text-[48px] leading-[1.05] font-semibold tracking-[-0.035em] md:text-[56px]">{money(t.spentMinor, cur)}</p>

              {compareBase > 0 && (
                <p className={clsx('mt-3 inline-flex items-start gap-1.5 text-[14.5px]', diff > 0 ? 'text-critical-text' : 'text-good-text')}>
                  {diff > 0 ? <ArrowUpRight className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ArrowDownRight className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  <span>
                    {money(Math.abs(diff), cur)} {diff > 0 ? 'more' : 'less'} than {o.isCurrent ? `this point in ${prevName}` : prevName}
                  </span>
                </p>
              )}

              <dl className="grid gap-3 pt-6 text-[14px]">
                {t.projectedMinor !== null && (
                  <div>
                    <dt className="text-muted">On pace for</dt>
                    <dd className="text-[17px] font-semibold">{money(t.projectedMinor, cur, { decimals: 0 })}</dd>
                  </div>
                )}
                {overall && (
                  <div>
                    <dt className="text-muted">Monthly budget</dt>
                    <dd className="flex flex-col gap-1.5">
                      <span className="text-[17px] font-semibold">
                        {overall.remainingMinor >= 0 ? `${money(overall.remainingMinor, cur)} left` : `${money(-overall.remainingMinor, cur)} over`}
                        <span className="ml-1 text-[13.5px] font-normal text-muted">of {money(overall.limitMinor, cur)}</span>
                      </span>
                      <Meter pct={overall.pct} />
                      <BudgetStatus pct={overall.pct} />
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <PaceChart
              data={o.daily}
              currency={cur}
              projectedMinor={t.projectedMinor}
              budgetMinor={overall?.limitMinor}
              daysElapsed={t.daysElapsed}
              monthLabel={monthName(period)}
              prevLabel={prevName}
            />
          </section>

          {/* ---------------- figures strip */}
          <section className="grid grid-cols-2 border-t border-line md:grid-cols-4">
            <Figure label="Daily average" value={money(t.avgPerDayMinor, cur, { decimals: 0 })} />
            <Figure label="Expenses" value={t.txCount} />
            <Figure label="Biggest category" value={o.byCategory[0]?.category || '-'} small />
            <Figure label="Biggest expense" value={o.largest[0] ? money(o.largest[0].amountMinor, cur) : '-'} sub={o.largest[0]?.merchant} />
          </section>

          {/* ---------------- categories + budgets */}
          <section className="grid border-t border-line lg:grid-cols-[1.35fr_1fr]">
            <div className="p-5 md:p-7">
              <SectionTitle aside={<span className="text-[13px] text-muted">Select one to see its expenses</span>}>Where it went</SectionTitle>
              {o.byCategory.length ? (
                <CategoryBars rows={o.byCategory} currency={cur} onSelect={openCategory} />
              ) : (
                <p className="text-[14.5px] text-muted">Nothing spent in {periodLabel(period)}.</p>
              )}
            </div>
            <div className="border-t border-line p-5 md:p-7 lg:border-t-0 lg:border-l">
              <SectionTitle
                aside={
                  <Link to="/budgets" className="text-[13.5px] font-medium text-accent hover:underline">
                    Manage
                  </Link>
                }
              >
                Budgets
              </SectionTitle>
              {categoryBudgets.length ? (
                <ul className="flex flex-col gap-4">
                  {categoryBudgets.slice(0, 6).map((b) => (
                    <li key={b.category}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[14.5px] font-medium">{b.category}</span>
                        <span className="tnum text-[13.5px] text-ink-2">
                          {money(b.spentMinor, cur)} <span className="text-muted">/ {money(b.limitMinor, cur)}</span>
                        </span>
                      </div>
                      <Meter pct={b.pct} />
                      <div className="mt-1">
                        <BudgetStatus pct={b.pct} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[14.5px] text-ink-2">
                  <p>Set a monthly limit for a category and you’ll get an email at 80% and 100%.</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/budgets')}>
                    Set a budget
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ---------------- trend + weekday */}
          <section className="grid border-t border-line lg:grid-cols-2">
            <div className="p-5 md:p-7">
              <SectionTitle>Last 6 months</SectionTitle>
              <ColumnChart
                data={o.trend.map((x) => ({ label: x.label, title: periodLabel(x.period), value: x.totalMinor, count: x.count }))}
                highlightIndex={o.trend.length - 1}
                currency={cur}
                ariaLabel="Monthly spending for the last six months"
              />
            </div>
            <div className="border-t border-line p-5 md:p-7 lg:border-t-0 lg:border-l">
              <SectionTitle>By day of week</SectionTitle>
              <ColumnChart
                data={o.weekday.map((w) => ({ label: w.day, value: w.totalMinor, count: w.count }))}
                highlightIndex={o.weekday.reduce((best, w, i, arr) => (w.totalMinor > arr[best].totalMinor ? i : best), 0)}
                currency={cur}
                ariaLabel="Spending by day of the week this month"
              />
            </div>
          </section>

          {/* ---------------- recent + merchants */}
          <section className="grid border-t border-line lg:grid-cols-[1.35fr_1fr]">
            <div className="p-5 md:p-7">
              <SectionTitle
                aside={
                  <Link to="/expenses" className="text-[13.5px] font-medium text-accent hover:underline">
                    See all
                  </Link>
                }
              >
                Recent expenses
              </SectionTitle>
              <ul className="flex flex-col">
                {recent.data?.items.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => openForm(e)} className="flex w-full items-center gap-3 rounded-[10px] px-1 py-2 text-left hover:bg-surface-2">
                      <CategoryIcon category={e.category} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium">{e.merchant}</span>
                        <span className="block text-[12.5px] text-muted">
                          {dateLabel(e.date, user.timezone)}, {e.paymentMethod}
                        </span>
                      </span>
                      <span className="tnum text-[14.5px] font-semibold">{money(e.amountMinor, e.currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-line p-5 md:p-7 lg:border-t-0 lg:border-l">
              <SectionTitle>Top places</SectionTitle>
              <RankList rows={o.topMerchants.map((x) => ({ name: x.merchant, value: x.totalMinor, sub: `${x.count} ${x.count === 1 ? 'visit' : 'visits'}` }))} currency={cur} />
              <SectionTitle className="mt-7">Paid with</SectionTitle>
              <RankList rows={o.byPaymentMethod.map((x) => ({ name: x.paymentMethod, value: x.totalMinor, sub: `${x.count} ${x.count === 1 ? 'payment' : 'payments'}` }))} currency={cur} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, sub, small }) {
  return (
    <div className="border-line px-5 py-4 md:px-7 [&:nth-child(even)]:border-l md:[&:not(:first-child)]:border-l [&:nth-child(n+3)]:border-t md:[&:nth-child(n+3)]:border-t-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={clsx('mt-0.5 truncate font-semibold', small ? 'text-[16px] leading-7' : 'text-[19px]')}>{value}</div>
      {sub && <div className="truncate text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

function RankList({ rows, currency }) {
  if (!rows.length) return <p className="text-[14px] text-muted">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="truncate font-medium">{r.name}</span>
            <span className="tnum font-semibold">{money(r.value, currency)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1">
              <div className="h-1.5 rounded-r-[4px] bg-[var(--chart-prev)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
            <span className="w-[72px] text-right text-[12px] text-muted">{r.sub}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Welcome({ onAdd }) {
  return (
    <div className="rounded-2xl bg-surface p-7 ring-1 ring-line md:p-10">
      <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Let’s log your first expense</h2>
      <p className="mt-2 max-w-[56ch] text-[15.5px] text-ink-2">
        Type it the way you’d text a friend in the bar at the top, like “450 swiggy yesterday”, or paste the SMS your bank sent you. You can also fill in a form.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={onAdd}>
          <Plus className="size-4" aria-hidden /> Add expense
        </Button>
        <Button variant="secondary" onClick={() => document.getElementById('quick-add')?.focus()}>
          Type it instead
        </Button>
      </div>
      <p className="mt-8 text-[14px] text-muted">Once you’ve added a few, this page shows how fast you’re spending, where the money goes and how you’re tracking against budgets.</p>
    </div>
  );
}
