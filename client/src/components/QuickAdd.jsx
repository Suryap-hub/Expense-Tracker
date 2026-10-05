import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CornerDownLeft, MessageSquareText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, newIdempotencyKey } from '../lib/api.js';
import { CATEGORIES, PAYMENT_METHODS } from '../lib/constants.js';
import { money, todayIn } from '../lib/format.js';
import { Button, ErrorNote, Input, Modal, Select, Spinner } from './ui.jsx';

const EXAMPLES = ['450 swiggy yesterday', 'metro 60, chai 20', 'Paste a bank or UPI SMS'];

/**
 * The fastest way in: type like you'd text a friend, or paste bank SMS.
 * Groq turns it into drafts; nothing is saved until you confirm.
 */
export default function QuickAdd({ compact = false }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState(null);
  const [meta, setMeta] = useState(null);
  const idemKey = useRef(null);
  const inputRef = useRef(null);

  const parse = useMutation({
    mutationFn: (t) => api('/ai/parse', { method: 'POST', body: { text: t } }),
    onSuccess: (r) => {
      if (!r.drafts.length) {
        toast.message('No spending found in that text', { description: 'Try something like “250 lunch at Dominos”.' });
        return;
      }
      idemKey.current = newIdempotencyKey();
      setDrafts(r.drafts.map((d, i) => ({ ...d, key: i })));
      setMeta({ engine: r.engine, warning: r.warning, ms: r.ms });
    },
    onError: (e) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api('/expenses/bulk', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey.current },
        body: { expenses: drafts.map(({ amount, merchant, category, paymentMethod, date, note, source }) => ({ amount, merchant, category, paymentMethod, date, note, source })) },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast.success(r.expenses.length === 1 ? 'Saved 1 expense' : `Saved ${r.expenses.length} expenses`);
      setDrafts(null);
      setText('');
    },
  });

  const submit = () => {
    const t = text.trim();
    if (t.length >= 2 && !parse.isPending) parse.mutate(t);
  };

  const update = (key, field, value) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, [field]: value } : d)));
  const total = drafts?.reduce((s, d) => s + Math.round(parseFloat(d.amount || 0) * 100), 0) || 0;
  const rowErrors = save.error?.details || [];

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative flex-1"
      >
        <label htmlFor="quick-add" className="sr-only">
          Quick add: describe an expense or paste bank SMS
        </label>
        <MessageSquareText className="pointer-events-none absolute top-[11px] left-3 size-[18px] text-muted" aria-hidden />
        <textarea
          id="quick-add"
          ref={inputRef}
          value={text}
          rows={text.includes('\n') ? Math.min(5, text.split('\n').length) : 1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={4000}
          placeholder={compact ? 'Type or paste an expense' : `“${EXAMPLES[0]}” or paste a bank SMS`}
          className="block min-h-10 w-full resize-none rounded-[10px] bg-surface py-[9px] pr-24 pl-10 text-[15px] ring-1 ring-line-strong ring-inset placeholder:text-muted focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <div className="absolute top-[5px] right-1.5 flex items-center gap-1">
          {parse.isPending ? (
            <span className="flex h-[30px] items-center gap-1.5 px-2 text-[13px] text-muted">
              <Spinner /> Reading
            </span>
          ) : (
            text.trim() && (
              <button type="submit" className="flex h-[30px] items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[13px] font-medium text-accent-ink hover:bg-accent-hover">
                Add <CornerDownLeft className="size-3.5" aria-hidden />
              </button>
            )
          )}
        </div>
      </form>

      <Modal open={Boolean(drafts)} onClose={() => setDrafts(null)} title="Check before saving" wide>
        {drafts && (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] text-ink-2">
              {meta?.engine === 'groq' ? `Read by AI in ${meta.ms} ms.` : 'Read with the basic parser.'} Fix anything that looks off, then save.
            </p>
            {meta?.warning && <ErrorNote error={meta.warning} />}

            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[720px] text-[14px]">
                <thead className="text-left text-[13px] text-ink-2">
                  <tr>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Paid to</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Paid with</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, i) => {
                    const err = rowErrors.filter((x) => x.field.startsWith(`expenses.${i}.`)).map((x) => x.message)[0];
                    return (
                      <tr key={d.key} className="align-top">
                        <td className="py-1 pr-2">
                          <Input aria-label="Amount" inputMode="decimal" value={d.amount} onChange={(e) => update(d.key, 'amount', e.target.value)} className="tnum w-24 font-semibold" />
                          {err && <p className="mt-1 text-[12px] text-critical-text">{err}</p>}
                        </td>
                        <td className="py-1 pr-2">
                          <Input aria-label="Paid to" value={d.merchant} maxLength={100} onChange={(e) => update(d.key, 'merchant', e.target.value)} />
                        </td>
                        <td className="py-1 pr-2">
                          <Select aria-label="Category" value={d.category} onChange={(e) => update(d.key, 'category', e.target.value)} className="min-w-[170px]">
                            {CATEGORIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input aria-label="Date" type="date" max={todayIn(user.timezone)} value={d.date} onChange={(e) => update(d.key, 'date', e.target.value)} className="w-[150px]" />
                        </td>
                        <td className="py-1 pr-2">
                          <Select aria-label="Paid with" value={d.paymentMethod} onChange={(e) => update(d.key, 'paymentMethod', e.target.value)} className="w-[120px]">
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${d.merchant}`}
                            onClick={() => setDrafts((ds) => (ds.length === 1 ? null : ds.filter((x) => x.key !== d.key)))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {save.error && !rowErrors.length && <ErrorNote error={save.error} />}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="tnum text-[14px] text-ink-2">
                Total <strong className="text-ink">{money(total, user.currency)}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDrafts(null)}>
                  Discard
                </Button>
                <Button onClick={() => save.mutate()} loading={save.isPending}>
                  {drafts.length === 1 ? 'Save expense' : `Save ${drafts.length} expenses`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
