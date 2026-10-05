import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Info, Lightbulb, Mail, ThumbsUp, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button, ErrorNote, MonthSwitcher, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { currentPeriod, periodLabel } from '../lib/format.js';

const KIND = {
  warning: { icon: TriangleAlert, label: 'Watch out', className: 'text-warning-text' },
  tip: { icon: Lightbulb, label: 'Saving idea', className: 'text-accent' },
  positive: { icon: ThumbsUp, label: 'Going well', className: 'text-good-text' },
  info: { icon: Info, label: 'Pattern', className: 'text-ink-2' },
};

export default function Insights() {
  const { user } = useAuth();
  const nowPeriod = currentPeriod(user.timezone);
  const [period, setPeriod] = useState(nowPeriod);
  const insights = useQuery({ queryKey: ['insights', period], queryFn: () => api(`/ai/insights?period=${period}`), staleTime: 5 * 60_000 });

  const report = useMutation({
    mutationFn: () => api('/users/me/send-report', { method: 'POST', body: { period } }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(e.message),
  });

  const d = insights.data;

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Insights</h1>
        <MonthSwitcher period={period} onChange={setPeriod} max={nowPeriod} />
      </div>

      {insights.isPending ? (
        <div className="mt-10 flex items-center gap-3 text-ink-2">
          <Spinner className="size-5" /> Looking through {periodLabel(period)}…
        </div>
      ) : insights.isError ? (
        <ErrorNote error={insights.error} className="mt-6" />
      ) : (
        <>
          <p className="mt-6 max-w-[52ch] text-[22px] leading-snug font-medium tracking-[-0.015em] text-balance md:text-[26px]">{d.headline}</p>
          <p className="mt-2 text-[13px] text-muted">{d.engine === 'groq' ? 'Written by AI from your monthly totals. Your notes are never sent.' : 'Based on simple rules. Add a Groq API key on the server for AI-written insights.'}</p>

          {d.insights.length > 0 && (
            <ul className="mt-8 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
              {d.insights.map((x, i) => {
                const k = KIND[x.type] || KIND.info;
                const Icon = k.icon;
                return (
                  <li key={i} className="flex gap-4 px-5 py-5 md:px-6">
                    <Icon className={clsx('mt-0.5 size-5 shrink-0', k.className)} aria-hidden />
                    <div>
                      <p className={clsx('text-[12.5px] font-medium', k.className)}>{k.label}</p>
                      <p className="mt-0.5 text-[16px] font-semibold">{x.title}</p>
                      <p className="mt-1 max-w-[62ch] text-[15px] text-ink-2">{x.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl bg-accent-soft px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <p className="font-semibold">Get this month as an email</p>
          <p className="text-[14px] text-ink-2">A summary of {periodLabel(period)} with categories, budgets and biggest expenses, sent to {user.email}.</p>
        </div>
        <Button onClick={() => report.mutate()} loading={report.isPending} className="shrink-0">
          <Mail className="size-4" aria-hidden /> Email me the report
        </Button>
      </div>
    </div>
  );
}
