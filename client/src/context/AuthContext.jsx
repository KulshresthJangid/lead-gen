import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client.js';

const TOKEN_KEY = 'lg_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = unknown (verifying), false = logged out, true = logged in
  const [authenticated, setAuthenticated] = useState(null);

  // Silently verify the stored token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setAuthenticated(false);
      return;
    }
    apiClient
      .post('/auth/verify', null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(({ data }) => setAuthenticated(data.valid === true))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthenticated(false);
      });
  }, []);

  const login = useCallback((token) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, login, logout }}>
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
