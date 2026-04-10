import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client.js';

const TOKEN_KEY = 'lg_token';
const USER_KEY  = 'lg_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = unknown (verifying), false = logged out, true = logged in
  const [authenticated, setAuthenticated] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setAuthenticated(false); return; }

    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try { setUser(JSON.parse(cached)); } catch { /* ignore */ }
    }

    apiClient
      .post('/auth/verify', {}, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (data.valid) {
          if (data.user) {
            setUser(data.user);
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          }
          setAuthenticated(true);
        } else {
          throw new Error('invalid');
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setAuthenticated(false);
        setUser(null);
      });
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem(TOKEN_KEY, token);
    if (userData) localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData || null);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthenticated(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export { TOKEN_KEY };
