// FILE PATH: frontend/src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../services/api';
import { isTokenExpired } from '../utils/jwt';
import { connectSocket, getSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

const PERMS_KEY = 'cachedPermissions';
const readJson = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v; } catch { return null; } };

/** { name → true } for every allowed permission, from the server's flat list. */
const toMap = (perms) => {
  const map = {};
  (Array.isArray(perms) ? perms : []).forEach((p) => { if (p && p.name && p.is_allowed !== false) map[p.name] = true; });
  return map;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => (localStorage.getItem('accessToken') && !isTokenExpired(localStorage.getItem('accessToken')) ? readJson('user') : null));
  const [token, setToken] = useState(() => { const t = localStorage.getItem('accessToken'); return t && !isTokenExpired(t) ? t : null; });
  const [permissions, setPermissions] = useState(() => readJson(PERMS_KEY) || []);
  const [loading, setLoading] = useState(true);

  const permMap = useRef(toMap(permissions));
  permMap.current = toMap(permissions);

  // ── clearing the session ───────────────────────────────────────────────────────────────────────
  const clearSession = useCallback(() => {
    setUser(null); setToken(null); setPermissions([]);
    ['user', 'accessToken', PERMS_KEY].forEach((k) => localStorage.removeItem(k));
    try { delete window.__auth_user; } catch { /* ignore */ }
    disconnectSocket();
  }, []);

  const logout = useCallback(async () => {
    const res = await authService.logout();
    clearSession();
    return res;
  }, [clearSession]);

  // ── signing in ─────────────────────────────────────────────────────────────────────────────────
  /** Resolves with the server's reply; throws (with a readable .message) when sign-in fails. */
  const login = async (credentials) => {
    const res = await authService.login(credentials);
    const nextUser = { ...res.user, password_change_required: res.password_change_required ?? res.user?.password_change_required };
    localStorage.setItem('accessToken', res.token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    if (res.user?.storeInfo?.store_id) localStorage.setItem('currentStoreId', res.user.storeInfo.store_id);
    const perms = Array.isArray(res.permissions) ? res.permissions : [];
    localStorage.setItem(PERMS_KEY, JSON.stringify(perms));
    setToken(res.token); setUser(nextUser); setPermissions(perms);
    return res;
  };

  /** Merge partial changes (name, avatar, language…) into the signed-in person everywhere at once. */
  const updateUser = (partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem('user', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  /** After switching store: the person's role, permissions and (refreshed) token for that store. */
  const applyStoreSwitch = ({ storeInfo, permissions: perms, token: newToken, security }) => {
    setUser((prev) => {
      const next = { ...prev, storeInfo, security: { ...prev?.security, ...security } };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
    if (newToken) { setToken(newToken); localStorage.setItem('accessToken', newToken); }
    if (Array.isArray(perms)) { setPermissions(perms); localStorage.setItem(PERMS_KEY, JSON.stringify(perms)); }
  };

  /** After a password change the server hands back a fresh token and clears the "must change" flag. */
  const updateSessionAfterPasswordChange = useCallback(({ token: newToken, security } = {}) => {
    if (newToken) { setToken(newToken); localStorage.setItem('accessToken', newToken); }
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, password_change_required: false, security: { ...prev.security, ...security } };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  const updateSecuritySettings = useCallback((security) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, security: { ...prev.security, ...security } };
      localStorage.setItem('user', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('biztrack-security-settings-updated', { detail: next.security }));
      return next;
    });
  }, []);

  // ── boot: check the stored session once, then refresh permissions from the server ──────────────
  useEffect(() => {
    const t = localStorage.getItem('accessToken');
    if (!t || isTokenExpired(t)) { clearSession(); }
    setLoading(false);
  }, [clearSession]);

  const storeId = user?.storeInfo?.store_id;
  const roleId = user?.storeInfo?.role_id;
  useEffect(() => {
    if (!token || !storeId || !roleId) return undefined;
    let cancelled = false;
    // Up to three tries with growing pauses (a sleeping server); whatever is cached keeps the menu on screen meanwhile.
    const load = async (attempt = 1) => {
      try {
        const res = await authService.getPermissions();
        if (cancelled) return;
        setPermissions(res.data);
        localStorage.setItem(PERMS_KEY, JSON.stringify(res.data));
      } catch {
        if (!cancelled && attempt < 3) setTimeout(() => load(attempt + 1), 1000 * 2 ** (attempt - 1));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, storeId, roleId]);

  // ── the session ends on its own when the token runs out, or when another tab signs out ────────
  useEffect(() => {
    if (!token) return undefined;
    let ms = 0;
    try { ms = JSON.parse(atob(token.split('.')[1])).exp * 1000 - Date.now(); } catch { /* ignore */ }
    if (ms <= 0) { clearSession(); return undefined; }
    const timer = setTimeout(clearSession, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [token, clearSession]);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'accessToken' && !e.newValue) clearSession(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearSession]);

  // Password expired on the server (428): mark the person so ProtectedRoute shows the change screen.
  useEffect(() => {
    const onRequired = () => setUser((prev) => (prev ? { ...prev, password_change_required: true } : prev));
    window.addEventListener('biztrack:password-change-required', onRequired);
    return () => window.removeEventListener('biztrack:password-change-required', onRequired);
  }, []);

  // ── real-time connection (new sales, low stock…); pages react through useLiveRefresh ──────────
  useEffect(() => {
    if (!user?.id || !storeId || !user.storeInfo?.role_name || !import.meta.env.VITE_SOCKET_URL) return undefined;
    const socket = connectSocket({ userId: user.id, storeId: localStorage.getItem('currentStoreId') || storeId, role: user.storeInfo.role_name });
    const onSecurity = (payload) => { if (payload?.security) updateSecuritySettings(payload.security); };
    socket.on('storeSecurityUpdated', onSecurity);
    return () => { getSocket()?.off('storeSecurityUpdated', onSecurity); };
  }, [user?.id, storeId, user?.storeInfo?.role_name, updateSecuritySettings]);

  useEffect(() => {
    try { if (user) window.__auth_user = user; else delete window.__auth_user; } catch { /* ignore */ }
  }, [user]);

  /** Does this person hold the permission in the current store? (The server decides every action;
   * this only decides which buttons to show.) */
  const can = (key) => !!key && permMap.current[key] === true;
  /** …ANY of these? */
  const canAny = (...keys) => keys.flat().some((k) => can(k));

  const value = {
    user, token, permissions, loading,
    isAuthenticated: !!user && !!token,
    can, canAny,
    login, logout, updateUser, applyStoreSwitch,
    updateSessionAfterPasswordChange, updateSecuritySettings,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
