import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext.jsx';
import { Logo } from '../components/Layout.jsx';
import { Button, ErrorNote, Field, Input, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-5 py-8 md:px-12">
        <Link to="/login" aria-label="SpendWise home">
          <Logo />
        </Link>
        <div className="my-auto w-full max-w-[380px] self-center py-10">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-ink-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-[14.5px] text-ink-2">{footer}</div>}
        </div>
      </div>
      <aside className="hidden flex-col justify-center border-l border-line bg-surface px-14 lg:flex" aria-hidden>
        <Illustration />
        <p className="mt-8 max-w-[34ch] text-[22px] leading-snug font-medium tracking-[-0.015em]">Know by the 10th whether this month will be a tight one.</p>
        <p className="mt-3 max-w-[44ch] text-[15px] text-ink-2">
          Log spends by typing them or pasting your bank SMS. SpendWise tracks your pace against last month and emails you before a budget runs out.
        </p>
      </aside>
    </div>
  );
}

/** A static pace chart: this month's line pulling ahead of last month's. */
function Illustration() {
  return (
    <svg viewBox="0 0 420 220" className="w-full max-w-[460px]">
      {[40, 90, 140, 190].map((y) => (
        <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="var(--grid)" />
      ))}
      <line x1="0" x2="420" y1="62" y2="62" stroke="var(--ink-2)" strokeOpacity="0.5" strokeWidth="1.5" />
      <text x="4" y="54" className="fill-[var(--ink-2)] text-[12px]">
        budget
      </text>
      <path d="M0,190 L40,184 80,176 120,170 160,158 200,150 240,138 280,128 320,118 360,104 420,92" fill="none" stroke="var(--chart-prev)" strokeWidth="2" strokeLinecap="round" />
      <path d="M0,190 L40,180 80,168 120,150 160,138 200,120 240,104 L240,190 L0,190Z" fill="var(--chart-wash)" />
      <path d="M0,190 L40,180 80,168 120,150 160,138 200,120 240,104" fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="240" y1="104" x2="420" y2="40" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1 6" />
      <circle cx="240" cy="104" r="5" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

function usePasswordToggle() {
  const [show, setShow] = useState(false);
  const toggle = (
    <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 text-[13px] text-muted hover:text-ink">
      {show ? 'Hide' : 'Show'}
    </button>
  );
  return [show ? 'text' : 'password', toggle];
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [type, toggle] = usePasswordToggle();
  const m = useMutation({ mutationFn: () => login(f.email, f.password), onSuccess: () => navigate('/', { replace: true }) });
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST', body: { email: f.email } }),
    onSuccess: () => toast.success('Verification email sent. Check your inbox.'),
  });

  return (
    <Shell
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" required autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Password">
          {(p) => (
            <div className="relative">
              <Input {...p} type={type} autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="pr-14" />
              {toggle}
            </div>
          )}
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-[13.5px] text-ink-2 hover:text-ink hover:underline">
            Forgot password?
          </Link>
        </div>
        {m.error && (
          <div className="grid gap-2">
            <ErrorNote error={m.error} />
            {m.error.code === 'EMAIL_NOT_VERIFIED' && (
              <Button type="button" variant="secondary" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                Send the verification email again
              </Button>
            )}
          </div>
        )}
        <Button type="submit" loading={m.isPending} className="mt-1 h-11">
          Sign in
        </Button>
      </form>
    </Shell>
  );
}

export function Register() {
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [type, toggle] = usePasswordToggle();
  const m = useMutation({
    mutationFn: () => api('/auth/register', { method: 'POST', body: f }),
    onSuccess: () => navigate(`/check-email?email=${encodeURIComponent(f.email)}`),
  });
  const errors = m.error?.fieldErrors || {};
  return (
    <Shell
      title="Create your account"
      subtitle="Free, and takes under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} autoComplete="name" required autoFocus maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <Field label="Email" error={errors.email} hint="We’ll send a link to confirm it’s yours.">
          {(p) => <Input {...p} type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          {(p) => (
            <div className="relative">
              <Input {...p} type={type} autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="pr-14" />
              {toggle}
            </div>
          )}
        </Field>
        {m.error && !Object.keys(errors).length && <ErrorNote error={m.error} />}
        <Button type="submit" loading={m.isPending} className="mt-1 h-11">
          Create account
        </Button>
      </form>
    </Shell>
  );
}

export function CheckEmail() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST', body: { email } }),
    onSuccess: () => toast.success('Sent again. It can take a minute to arrive.'),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Shell title="Check your inbox" footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}>
      <div className="flex gap-3">
        <MailCheck className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
        <p className="text-[15.5px] text-ink-2">
          We sent a link to <strong className="text-ink">{email || 'your email'}</strong>. Open it to activate your account. Check spam if it isn’t there in a minute.
        </p>
      </div>
      {email && (
        <Button variant="secondary" className="mt-6" loading={resend.isPending} onClick={() => resend.mutate()}>
          Send the link again
        </Button>
      )}
      {import.meta.env.DEV && <p className="mt-6 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-ink-2">Running locally without SMTP? The link is printed in the server terminal.</p>}
    </Shell>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev; the token is single-use
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token: params.get('token') || '' } })
      .then((r) => {
        signIn(r);
        toast.success('Email verified. Welcome to SpendWise!');
        navigate('/', { replace: true });
      })
      .catch(setError);
  }, [params, signIn, navigate]);

  return (
    <Shell title={error ? 'This link didn’t work' : 'Verifying your email'}>
      {error ? (
        <div className="grid gap-4">
          <ErrorNote error={error} />
          <p className="text-[14.5px] text-ink-2">Sign in with your email and password and we’ll offer to send a fresh link.</p>
          <Link to="/login" className="font-medium text-accent hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-ink-2">
          <Spinner className="size-5" /> One moment…
        </div>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => api('/auth/forgot-password', { method: 'POST', body: { email } }) });
  return (
    <Shell
      title="Reset your password"
      subtitle="Enter your account email and we’ll send a reset link that works for 30 minutes."
      footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}
    >
      {m.isSuccess ? (
        <div className="flex gap-3">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
          <p className="text-[15.5px] text-ink-2">If {email} has an account, a reset link is on its way.</p>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Email">{(p) => <Input {...p} type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          {m.error && <ErrorNote error={m.error} />}
          <Button type="submit" loading={m.isPending} className="h-11">
            Send reset link
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [type, toggle] = usePasswordToggle();
  const m = useMutation({
    mutationFn: () => api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') || '', password } }),
    onSuccess: (r) => {
      toast.success(r.message);
      navigate('/login', { replace: true });
    },
  });
  const errors = m.error?.fieldErrors || {};
  return (
    <Shell title="Choose a new password" subtitle="You’ll be signed out everywhere else.">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          {(p) => (
            <div className="relative">
              <Input {...p} type={type} autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="pr-14" />
              {toggle}
            </div>
          )}
        </Field>
        {m.error && !Object.keys(errors).length && <ErrorNote error={m.error} />}
        <Button type="submit" loading={m.isPending} className="h-11">
          Save new password
        </Button>
      </form>
    </Shell>
  );
}
