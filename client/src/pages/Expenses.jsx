import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { useExpenseForm } from '../components/Layout.jsx';
import { Button, CategoryIcon, ErrorNote, Input, Modal, Select, Spinner } from '../components/ui.jsx';
import { api, download } from '../lib/api.js';
import { CATEGORIES, PAYMENT_METHODS } from '../lib/constants.js';
import { dateLabel, isoDateIn, money, shiftPeriod, todayIn, toInput } from '../lib/format.js';

function presetRange(preset, tz) {
  const today = todayIn(tz);
  const month = today.slice(0, 7);
  const lastDay = (p) => {
    const [y, m] = p.split('-').map(Number);
    return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  };
  switch (preset) {
    case 'this_month':
      return { from: `${month}-01`, to: today };
    case 'last_month': {
      const p = shiftPeriod(month, -1);
      return { from: `${p}-01`, to: lastDay(p) };
    }
    case 'last_30':
      return { from: isoDateIn(new Date(Date.now() - 29 * 86_400_000).toISOString(), tz), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: '', to: '' };
  }
}

const PRESETS = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_30', 'Last 30 days'],
  ['this_year', 'This year'],
  ['all', 'All time'],
  ['custom', 'Custom dates'],
];

export default function Expenses() {
  const { user } = useAuth();
  const tz = user.timezone;
  const qc = useQueryClient();
  const openForm = useExpenseForm();
  const [params, setParams] = useSearchParams();

  const presetParam = params.get('preset');
  const explicit = params.get('from') !== null || params.get('to') !== null;
  const range = explicit ? { from: params.get('from') || '', to: params.get('to') || '' } : presetRange(presetParam || 'this_month', tz);
  const { from, to } = range;
  const category = params.get('category') || '';
  const paymentMethod = params.get('paymentMethod') || '';
  const sort = params.get('sort') || 'date_desc';
  const page = Number(params.get('page') || 1);
  const preset = presetParam || (explicit ? 'custom' : 'this_month');
  const [q, setQ] = useState(params.get('q') || '');
  const [toDelete, setToDelete] = useState(null);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') || '') !== q) update({ q });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo(() => {
    const s = new URLSearchParams({ sort, page: String(page), limit: '25' });
    if (from) s.set('from', from);
    if (to) s.set('to', to);
    if (category) s.set('category', category);
    if (paymentMethod) s.set('paymentMethod', paymentMethod);
    if (params.get('q')) s.set('q', params.get('q'));
    return s.toString();
  }, [from, to, category, paymentMethod, sort, page, params]);

  const list = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => api(`/expenses?${query}`), placeholderData: keepPreviousData });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['insights'] });
  };

  const restore = useMutation({
    mutationFn: (e) =>
      api('/expenses', {
        method: 'POST',
        body: { amount: toInput(e.amountMinor), merchant: e.merchant, category: e.category, paymentMethod: e.paymentMethod, note: e.note, date: e.date, source: e.source },
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Expense restored');
    },
  });

  const remove = useMutation({
    mutationFn: (e) => api(`/expenses/${e.id}`, { method: 'DELETE' }),
    onSuccess: (_r, e) => {
      setToDelete(null);
      invalidate();
      toast('Expense deleted', { action: { label: 'Undo', onClick: () => restore.mutate(e) } });
    },
    onError: (err) => toast.error(err.message),
  });

  const data = list.data;
  const filtered = category || paymentMethod || params.get('q');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Expenses</h1>
          {data && (
            <p className="mt-0.5 text-[14.5px] text-ink-2">
              {data.total} {data.total === 1 ? 'expense' : 'expenses'} totalling <strong className="text-ink">{money(data.sumMinor, user.currency)}</strong>
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            download(`/expenses/export.csv?${query.replace(/(^|&)(page|limit)=[^&]*/g, '')}`, 'expenses.csv').catch((e) => toast.error(e.message))
          }
        >
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
      </div>

      {/* One filter row, above everything it scopes */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Date range"
          className="w-auto"
          value={preset}
          onChange={(e) => {
            const p = e.target.value;
            if (p === 'custom') update({ preset: 'custom', from, to });
            else update({ preset: p === 'this_month' ? '' : p, from: '', to: '' });
          }}
        >
          {PRESETS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input aria-label="From" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value, preset: 'custom' })} className="w-[150px]" />
            <span className="text-muted">to</span>
            <Input aria-label="To" type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value, preset: 'custom' })} className="w-[150px]" />
          </div>
        )}
        <Select aria-label="Category" className="w-auto" value={category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select aria-label="Paid with" className="w-auto" value={paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })}>
          <option value="">Any payment</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Select aria-label="Sort" className="w-auto" value={sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Largest first</option>
          <option value="amount_asc">Smallest first</option>
        </Select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search" placeholder="Search payee or note" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => (setQ(''), update({ category: '', paymentMethod: '', q: '' }))}>
            Clear filters
          </Button>
        )}
      </div>

      {list.isError && <ErrorNote error={list.error} className="mb-4" />}

      <div className={clsx('overflow-hidden rounded-2xl bg-surface ring-1 ring-line transition-opacity', list.isFetching && list.isPlaceholderData && 'opacity-60')}>
        {list.isPending ? (
          <div className="grid h-48 place-items-center text-muted">
            <Spinner className="size-5" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[16px] font-medium">{filtered ? 'No expenses match these filters' : 'No expenses in this period'}</p>
            <p className="mt-1 text-[14.5px] text-muted">{filtered ? 'Try a wider date range or clear the filters.' : 'Add one with the button above, or type it in the bar at the top.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-[14.5px] md:table">
              <thead className="border-b border-line bg-surface-2 text-left text-[13px] text-ink-2">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Paid to</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Paid with</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="w-24 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="group border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="tnum px-5 py-3 whitespace-nowrap text-ink-2">{dateLabel(e.date, tz)}</td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="truncate font-medium">{e.merchant}</div>
                      {e.note && <div className="truncate text-[13px] text-muted">{e.note}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        <CategoryIcon category={e.category} className="size-7" />
                        {e.category}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{e.paymentMethod}</td>
                    <td className="tnum px-3 py-3 text-right font-semibold">{money(e.amountMinor, e.currency)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5 opacity-70 group-hover:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${e.merchant}`} onClick={() => openForm(e)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${e.merchant}`} onClick={() => setToDelete(e)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile list */}
            <ul className="md:hidden">
              {data.items.map((e) => (
                <li key={e.id} className="border-b border-line last:border-0">
                  <button onClick={() => openForm(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <CategoryIcon category={e.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.merchant}</span>
                      <span className="block text-[12.5px] text-muted">
                        {dateLabel(e.date, tz)}, {e.category}
                      </span>
                    </span>
                    <span className="tnum font-semibold">{money(e.amountMinor, e.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[13.5px] text-muted">
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <Modal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Delete this expense?">
        {toDelete && (
          <div>
            <p className="text-[15px] text-ink-2">
              {money(toDelete.amountMinor, toDelete.currency)} to {toDelete.merchant} on {dateLabel(toDelete.date, tz)}. You can undo right after.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setToDelete(null)}>
                Keep it
              </Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(toDelete)}>
                Delete expense
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
