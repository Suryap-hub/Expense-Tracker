import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onLoggedOut, refreshSession, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | guest

  const signIn = useCallback(({ accessToken, user: u }) => {
    setAccessToken(accessToken);
    setUser(u);
    setStatus('authed');
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
    qc.clear();
  }, [qc]);

  // Restore the session from the httpOnly refresh cookie on page load.
  useEffect(() => {
    onLoggedOut(clear);
    refreshSession()
      .then((body) => signIn(body))
      .catch(() => setStatus('guest'));
  }, [clear, signIn]);

  const value = useMemo(
    () => ({
      user,
      status,
      signIn,
      setUser,
      async login(email, password) {
        signIn(await api('/auth/login', { method: 'POST', body: { email, password } }));
      },
      async logout(everywhere = false) {
        try {
          await api(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
        } finally {
          clear();
        }
      },
      clear,
    }),
    [user, status, signIn, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
