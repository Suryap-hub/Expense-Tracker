import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { Meter } from '../components/charts/BarList.jsx';
import { BudgetStatus, Button, CategoryIcon, ErrorNote, Input, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CATEGORIES } from '../lib/constants.js';
import { currencySymbol, currentPeriod, money, periodLabel, toInput } from '../lib/format.js';

export default function Budgets() {
  const { user } = useAuth();
  const period = currentPeriod(user.timezone);
  const overview = useQuery({ queryKey: ['overview', period], queryFn: () => api(`/analytics/overview?period=${period}`) });

  if (overview.isPending) {
    return (
      <div className="grid h-[50vh] place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (overview.isError) return <ErrorNote error={overview.error} />;

  const o = overview.data;
  const budgets = new Map(o.budgets.map((b) => [b.category, b]));
  const spent = new Map(o.byCategory.map((c) => [c.category, c.totalMinor]));
  // Categories with a budget or spending first, the rest after.
  const rows = [...CATEGORIES].sort((a, b) => (budgets.has(b) - budgets.has(a)) || (spent.get(b) || 0) - (spent.get(a) || 0));

  return (
    <div className="max-w-[860px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Budgets</h1>
      <p className="mt-1 max-w-[64ch] text-[15px] text-ink-2">
        Monthly limits that reset on the 1st. You’ll get an email when you reach 80% and again at 100% of any budget. Showing {periodLabel(period)}.
      </p>

      <div className="mt-6 rounded-2xl bg-surface ring-1 ring-line">
        <BudgetRow category="Overall" label="All spending" budget={budgets.get('Overall')} spentMinor={o.totals.spentMinor} currency={o.currency} period={period} emphasis />
      </div>

      <div className="mt-4 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
        {rows.map((c) => (
          <BudgetRow key={c} category={c} budget={budgets.get(c)} spentMinor={spent.get(c) || 0} currency={o.currency} period={period} />
        ))}
      </div>
    </div>
  );
}

function BudgetRow({ category, label, budget, spentMinor, currency, period, emphasis }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(budget ? toInput(budget.limitMinor) : '');
  useEffect(() => setValue(budget ? toInput(budget.limitMinor) : ''), [budget]);

  const done = () => {
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['insights'] });
  };
  const save = useMutation({
    mutationFn: () => api(`/budgets/${encodeURIComponent(category)}`, { method: 'PUT', body: { limit: value } }),
    onSuccess: () => {
      done();
      toast.success(`${label || category} budget saved`);
    },
    onError: (e) => toast.error(e.fieldErrors?.limit || e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/budgets/${encodeURIComponent(category)}`, { method: 'DELETE' }),
    onSuccess: () => {
      done();
      setValue('');
      toast(`${label || category} budget removed`);
    },
  });

  const dirty = value.trim() !== (budget ? toInput(budget.limitMinor) : '');
  const pct = budget ? (spentMinor / budget.limitMinor) * 100 : 0;

  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[auto_1fr_220px] md:px-6">
      <CategoryIcon category={category} className={emphasis ? 'size-10' : undefined} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className={emphasis ? 'text-[16px] font-semibold' : 'text-[15px] font-medium'}>{label || category}</span>
          <span className="text-[13.5px] text-ink-2">
            {money(spentMinor, currency)} spent{budget && <span className="text-muted"> of {money(budget.limitMinor, currency)}</span>}
          </span>
        </div>
        {budget && (
          <div className="mt-2 flex flex-col gap-1">
            <Meter pct={pct} />
            <BudgetStatus pct={pct} />
          </div>
        )}
      </div>
      <form
        className="col-span-2 flex items-center gap-1.5 md:col-span-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) save.mutate();
        }}
      >
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-muted">{currencySymbol(currency)}</span>
          <Input
            aria-label={`Monthly limit for ${label || category} in ${periodLabel(period)}`}
            inputMode="decimal"
            placeholder="No limit"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tnum h-9 pl-7"
          />
        </div>
        {dirty && value.trim() ? (
          <Button type="submit" size="sm" loading={save.isPending}>
            Save
          </Button>
        ) : (
          budget && (
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label || category} budget`} onClick={() => remove.mutate()} loading={remove.isPending}>
              {!remove.isPending && <X className="size-4" />}
            </Button>
          )
        )}
      </form>
    </div>
  );
}
