import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button, ErrorNote, Field, Input, Modal, Select, Toggle } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CURRENCIES, TIMEZONES } from '../lib/constants.js';
import { currencySymbol, toInput } from '../lib/format.js';

const ACTIONS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.register': 'Account created',
  'auth.verify_email': 'Email verified',
  'auth.logout_all': 'Signed out everywhere',
  'auth.password_change': 'Password changed',
  'auth.password_reset': 'Password reset',
  'auth.password_reset_requested': 'Password reset requested',
  'user.update_settings': 'Settings updated',
  'expense.create': 'Expense added',
  'expense.bulk_create': 'Expenses added',
  'expense.update': 'Expense edited',
  'expense.delete': 'Expense deleted',
  'budget.set': 'Budget set',
  'budget.delete': 'Budget removed',
};

function Section({ title, description, children }) {
  return (
    <section className="grid gap-4 border-b border-line py-8 last:border-0 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
      </div>
      <div className="max-w-[520px]">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user.name, currency: user.currency, timezone: user.timezone });
  const [threshold, setThreshold] = useState(user.largeExpenseThresholdMinor ? toInput(user.largeExpenseThresholdMinor) : '0');

  const patch = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (r) => {
      setUser(r.user);
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(Object.values(e.fieldErrors)[0] || e.message),
  });

  const zones = TIMEZONES.includes(user.timezone) ? TIMEZONES : [user.timezone, ...TIMEZONES];
  const profileDirty = profile.name !== user.name || profile.currency !== user.currency || profile.timezone !== user.timezone;

  return (
    <div className="max-w-[900px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Settings</h1>

      <div className="mt-2">
        <Section title="Profile" description="Currency applies to new expenses. Timezone decides where a day and a month start.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              patch.mutate(profile);
            }}
          >
            <Field label="Name">{(p) => <Input {...p} value={profile.name} maxLength={60} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />}</Field>
            <Field label="Email" hint="Your sign-in email can’t be changed yet.">
              {(p) => <Input {...p} value={user.email} disabled />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                {(p) => (
                  <Select {...p} value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} ({currencySymbol(c)})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Timezone">
                {(p) => (
                  <Select {...p} value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
                    {zones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={!profileDirty} loading={patch.isPending && profileDirty}>
                Save changes
              </Button>
            </div>
          </form>
        </Section>

        <Section title="Email alerts" description={`Sent to ${user.email}.`}>
          <div className="divide-y divide-line">
            <Toggle
              label="Budget alerts"
              description="When a budget reaches 80% and when it goes over."
              checked={user.emailPrefs.budgetAlerts}
              onChange={(v) => patch.mutate({ emailPrefs: { budgetAlerts: v } })}
            />
            <div>
              <Toggle
                label="Large expense alerts"
                description="When a single expense is at or above your limit."
                checked={user.emailPrefs.largeExpense}
                onChange={(v) => patch.mutate({ emailPrefs: { largeExpense: v } })}
              />
              {user.emailPrefs.largeExpense && (
                <form
                  className="flex items-end gap-2 pb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    patch.mutate({ largeExpenseThreshold: threshold || '0' });
                  }}
                >
                  <Field label="Alert at or above" className="flex-1">
                    {(p) => (
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{currencySymbol(user.currency)}</span>
                        <Input {...p} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="tnum pl-7" />
                      </div>
                    )}
                  </Field>
                  <Button type="submit" variant="secondary" disabled={threshold === toInput(user.largeExpenseThresholdMinor)}>
                    Save limit
                  </Button>
                </form>
              )}
            </div>
            <Toggle
              label="Monthly summary"
              description="On the 1st, a breakdown of the month that just ended."
              checked={user.emailPrefs.monthlySummary}
              onChange={(v) => patch.mutate({ emailPrefs: { monthlySummary: v } })}
            />
          </div>
        </Section>

        <Section title="Appearance">
          <ThemePicker />
        </Section>

        <Section title="Security" description="Changing your password signs you out on every device.">
          <ChangePassword onDone={() => logout()} />
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <Button variant="secondary" onClick={() => logout(true)}>
              Sign out of all devices
            </Button>
            <span className="text-[13.5px] text-muted">Use this if you signed in on a shared computer.</span>
          </div>
          <Activity />
        </Section>

        <Section title="Delete account" description="Removes your account, every expense and every budget. This can’t be undone.">
          <DeleteAccount />
        </Section>
      </div>
    </div>
  );
}

function ThemePicker() {
  const read = () => {
    try {
      return localStorage.getItem('sw-theme') || 'system';
    } catch {
      return 'system';
    }
  };
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === 'system') localStorage.removeItem('sw-theme');
      else localStorage.setItem('sw-theme', theme);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
  }, [theme]);
  const opts = [
    ['system', 'Match device', Monitor],
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-[12px] bg-surface-2 p-1">
      {opts.map(([v, label, Icon]) => (
        <button
          key={v}
          role="radio"
          aria-checked={theme === v}
          onClick={() => setTheme(v)}
          className={clsx('flex h-9 items-center gap-2 rounded-[9px] px-3 text-[14px]', theme === v ? 'bg-surface font-medium shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink')}
        >
          <Icon className="size-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

function ChangePassword({ onDone }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const m = useMutation({
    mutationFn: () => api('/users/me/change-password', { method: 'POST', body: f }),
    onSuccess: (r) => {
      toast.success(r.message);
      onDone();
    },
  });
  const errors = m.error?.fieldErrors || {};
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Field label="Current password" error={errors.currentPassword}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />}
      </Field>
      <Field label="New password" error={errors.newPassword} hint="At least 8 characters, with a letter and a number.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" required value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />}
      </Field>
      {m.error && !Object.keys(errors).length && <ErrorNote error={m.error} />}
      <div>
        <Button type="submit" variant="secondary" loading={m.isPending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function Activity() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['activity'], queryFn: () => api('/users/me/activity') });
  if (!q.data?.items.length) return null;
  return (
    <div className="mt-8">
      <h3 className="text-[14.5px] font-semibold">Recent activity</h3>
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-auto rounded-[12px] ring-1 ring-line">
        {q.data.items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
            <span className={a.action === 'auth.login_failed' ? 'text-critical-text' : ''}>{ACTIONS[a.action] || a.action}</span>
            <span className="text-right text-muted">
              {new Date(a.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timezone })}
              {a.ip && <span className="block text-[12px]">{a.ip}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteAccount() {
  const { clear } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const m = useMutation({
    mutationFn: () => api('/users/me', { method: 'DELETE', body: { password } }),
    onSuccess: () => {
      toast.success('Your account was deleted');
      clear();
    },
  });
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="grid gap-4"
        >
          <p className="text-[15px] text-ink-2">Every expense, budget and setting will be erased. Enter your password to confirm.</p>
          <Field label="Password">{(p) => <Input {...p} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          {m.error && <ErrorNote error={m.error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button type="submit" variant="danger" loading={m.isPending}>
              Delete everything
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
