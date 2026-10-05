import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, newIdempotencyKey } from '../lib/api.js';
import { CATEGORIES, PAYMENT_METHODS } from '../lib/constants.js';
import { currencySymbol, isoDateIn, toInput, todayIn } from '../lib/format.js';
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui.jsx';

/** Add / edit an expense. Pass `expense` to edit. */
export default function ExpenseForm({ open, onClose, expense }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tz = user.timezone;
  const editing = Boolean(expense);
  const empty = { amount: '', merchant: '', category: '', paymentMethod: 'UPI', date: todayIn(tz), note: '' };
  const [form, setForm] = useState(empty);
  const [suggesting, setSuggesting] = useState(false);
  const idemKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    idemKey.current = newIdempotencyKey();
    setForm(
      expense
        ? {
            amount: toInput(expense.amountMinor),
            merchant: expense.merchant,
            category: expense.category,
            paymentMethod: expense.paymentMethod,
            date: isoDateIn(expense.date, tz),
            note: expense.note || '',
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, category: form.category || undefined };
      // Keep the original time of day when the date wasn't changed.
      if (editing && form.date === isoDateIn(expense.date, tz)) delete body.date;
      return editing
        ? api(`/expenses/${expense.id}`, { method: 'PATCH', body })
        : api('/expenses', { method: 'POST', body, headers: { 'Idempotency-Key': idemKey.current } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast.success(editing ? 'Expense updated' : 'Expense added');
      onClose();
    },
  });

  async function suggest() {
    if (!form.merchant.trim()) return;
    setSuggesting(true);
    try {
      const r = await api('/ai/categorize', { method: 'POST', body: { merchant: form.merchant, note: form.note } });
      setForm((f) => ({ ...f, category: r.category }));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSuggesting(false);
    }
  }

  const errors = save.error?.fieldErrors || {};

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit expense' : 'Add expense'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-[1fr_1.3fr] gap-3">
          <Field label="Amount" error={errors.amount}>
            {(p) => (
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{currencySymbol(user.currency)}</span>
                <Input {...p} inputMode="decimal" autoFocus required placeholder="0" value={form.amount} onChange={set('amount')} className="tnum pl-7 text-[17px] font-semibold" />
              </div>
            )}
          </Field>
          <Field label="Date" error={errors.date}>
            {(p) => <Input {...p} type="date" max={todayIn(tz)} required value={form.date} onChange={set('date')} />}
          </Field>
        </div>

        <Field label="Paid to / for" error={errors.merchant}>
          {(p) => <Input {...p} required maxLength={100} placeholder="Swiggy, rent, metro card..." value={form.merchant} onChange={set('merchant')} />}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" error={errors.category} hint={!form.category ? 'Leave blank to auto-pick' : undefined}>
            {(p) => (
              <div className="flex gap-1.5">
                <Select {...p} value={form.category} onChange={set('category')}>
                  <option value="">Auto</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" size="icon" className="shrink-0" title="Suggest a category" aria-label="Suggest a category" onClick={suggest} loading={suggesting} disabled={!form.merchant.trim()}>
                  {!suggesting && <Sparkles className="size-4" />}
                </Button>
              </div>
            )}
          </Field>
          <Field label="Paid with" error={errors.paymentMethod}>
            {(p) => (
              <Select {...p} value={form.paymentMethod} onChange={set('paymentMethod')}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Note" error={errors.note}>
          {(p) => <Textarea {...p} rows={2} maxLength={500} placeholder="Optional" value={form.note} onChange={set('note')} />}
        </Field>

        {save.error && !Object.keys(errors).length && <ErrorNote error={save.error} />}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
