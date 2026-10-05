import { forwardRef, useEffect, useId, useRef } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, LoaderCircle, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { CATEGORY_ICONS } from '../lib/constants.js';
import { periodLabel, shiftPeriod } from '../lib/format.js';

export function Spinner({ className }) {
  return <LoaderCircle aria-hidden className={clsx('animate-spin', className || 'size-4')} />;
}

const BUTTON = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-critical text-white hover:brightness-110',
};

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'icon' ? 'size-9' : 'h-10 px-4 text-[14.5px]',
        BUTTON[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

const width = (className) => (/(^|\s)(w-|min-w-|flex-1)/.test(className || '') ? '' : 'w-full');
const control =
  'rounded-[10px] bg-surface px-3 text-[15px] text-ink ring-1 ring-inset ring-line-strong placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent aria-[invalid=true]:ring-critical disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={clsx(control, width(className), 'h-10', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={clsx(control, width(className), 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={clsx(control, width(className), 'py-2', className)} {...props} />;
});

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, error, hint, children, className }) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy }) : children;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink-2">
          {label}
        </label>
      )}
      {child}
      {(error || hint) && (
        <p id={describedBy} className={clsx('text-[13px]', error ? 'text-critical-text' : 'text-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {description && <p className="text-[13.5px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={clsx('absolute top-0.5 left-0 size-5 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function CategoryIcon({ category, className }) {
  const Icon = CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
  return (
    <span className={clsx('inline-grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2', className)}>
      <Icon className="size-4" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

/** Status is never color alone: icon + label + color. */
export function BudgetStatus({ pct }) {
  if (pct >= 100)
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-critical-text">
        <OctagonAlert className="size-3.5" aria-hidden /> Over budget
      </span>
    );
  if (pct >= 80)
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warning-text">
        <TriangleAlert className="size-3.5" aria-hidden /> Nearly used
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-good-text">
      <CircleCheck className="size-3.5" aria-hidden /> On track
    </span>
  );
}

export function MonthSwitcher({ period, onChange, max }) {
  const atMax = max && period >= max;
  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onChange(shiftPeriod(period, -1))}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[8.5rem] text-center text-[15px] font-medium" aria-live="polite">
        {periodLabel(period)}
      </span>
      <Button variant="ghost" size="icon" aria-label="Next month" disabled={atMax} onClick={() => onChange(shiftPeriod(period, 1))}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function ErrorNote({ error, className }) {
  if (!error) return null;
  return (
    <div role="alert" className={clsx('flex items-start gap-2 rounded-[10px] bg-critical-soft px-3 py-2.5 text-[14px] text-critical-text', className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{error.message || String(error)}</span>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        'm-auto w-[calc(100%-24px)] rounded-2xl bg-surface p-0 text-ink shadow-2xl ring-1 ring-line backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        wide ? 'max-w-[860px]' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="sheet-in">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function SectionTitle({ children, aside, className }) {
  return (
    <div className={clsx('mb-4 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h2>
      {aside}
    </div>
  );
}
