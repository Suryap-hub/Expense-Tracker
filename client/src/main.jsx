import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '@fontsource-variable/onest';
import './index.css';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { CheckEmail, ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth.jsx';

// Secondary pages load on demand to keep the first download small.
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const Budgets = lazy(() => import('./pages/Budgets.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => err?.status >= 500 && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center text-muted">
      <Spinner className="size-6" />
    </div>
  );
}

function Protected({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/check-email" element={<CheckEmail />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="expenses" element={<Suspense fallback={<Spinner className="size-5" />}><Expenses /></Suspense>} />
        <Route path="budgets" element={<Suspense fallback={<Spinner className="size-5" />}><Budgets /></Suspense>} />
        <Route path="insights" element={<Suspense fallback={<Spinner className="size-5" />}><Insights /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<Spinner className="size-5" />}><Settings /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
