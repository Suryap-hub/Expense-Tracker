import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import clsx from 'clsx';
import { LayoutDashboard, LogOut, PiggyBank, Plus, ReceiptText, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import QuickAdd from './QuickAdd.jsx';
import { Button } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/insights', label: 'Insights', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const FormContext = createContext(() => {});
/** openExpenseForm() to add, openExpenseForm(expense) to edit - from any page. */
export const useExpenseForm = () => useContext(FormContext);

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 21.5 13.5 15l4 3.5L24 10.5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      SpendWise
    </span>
  );
}

function useIsDesktop() {
  const q = '(min-width: 768px)';
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mql = window.matchMedia(q);
    const on = () => setMatch(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return match;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const isDesktop = useIsDesktop();
  const [form, setForm] = useState({ open: false, expense: null });
  const openExpenseForm = (expense = null) => setForm({ open: true, expense });

  return (
    <FormContext.Provider value={openExpenseForm}>
      <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line px-4 py-5 md:flex">
          <div className="px-2">
            <Logo />
          </div>
          <nav className="mt-8 flex flex-col gap-0.5" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14.5px] transition-colors',
                    isActive ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-line px-2 pt-4">
            <div className="truncate text-[14px] font-medium">{user.name}</div>
            <div className="truncate text-[13px] text-muted">{user.email}</div>
            <button onClick={() => logout()} className="mt-3 inline-flex items-center gap-2 text-[13.5px] text-ink-2 hover:text-ink">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col pb-20 md:pb-0">
          {/* Top bar: quick add is on every page */}
          <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--page)_88%,transparent)] backdrop-blur">
            <div className="mx-auto flex max-w-[1180px] items-start gap-2 px-4 py-3 md:px-8">
              <div className="mr-1 pt-2 md:hidden">
                <Logo />
              </div>
              {isDesktop && (
                <div className="flex flex-1">
                  <QuickAdd />
                </div>
              )}
              <Button onClick={() => openExpenseForm()} className="ml-auto shrink-0 md:ml-0">
                <Plus className="size-4" aria-hidden /> <span>Add expense</span>
              </Button>
            </div>
            {!isDesktop && (
              <div className="px-4 pb-3">
                <QuickAdd compact />
              </div>
            )}
          </header>

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </main>
        </div>

        {/* Bottom tabs (mobile) */}
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11.5px]', isActive ? 'font-medium text-accent' : 'text-muted')}
            >
              <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <ExpenseForm open={form.open} expense={form.expense} onClose={() => setForm({ open: false, expense: null })} />
    </FormContext.Provider>
  );
}
