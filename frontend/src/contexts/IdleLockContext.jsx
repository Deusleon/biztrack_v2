// FILE PATH: frontend/src/contexts/IdleLockContext.jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { authService } from '../services/api';

const DEFAULT_MINUTES = 30;
const LOCK_KEY = 'biztrack_session_locked';
const IdleLockContext = createContext({ isLocked: false, unlock: async () => ({ success: false }), forceLock: () => {}, timeoutMinutes: DEFAULT_MINUTES });
const minutesOf = (security) => { const n = Number(security?.sessionTimeout ?? DEFAULT_MINUTES); return Number.isFinite(n) ? Math.min(480, Math.max(5, n)) : DEFAULT_MINUTES; };

/**
 * Locks the screen after the store's "session timeout" minutes without activity (mouse, keys, touch, scroll). The person comes back
 * with their password — no new sign-in. The lock survives a refresh (sessionStorage) and returns to the page they were on.
 */
export function IdleLockProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const { showSuccess } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLocked, setIsLocked] = useState(() => sessionStorage.getItem(LOCK_KEY) === 'true');
  const [timeoutMinutes, setTimeoutMinutes] = useState(() => minutesOf(user?.security));
  const timer = useRef(null);

  useEffect(() => { setTimeoutMinutes(minutesOf(user?.security)); }, [user?.security?.sessionTimeout]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e) => setTimeoutMinutes(minutesOf(e.detail)); window.addEventListener('biztrack-security-settings-updated', h); return () => window.removeEventListener('biztrack-security-settings-updated', h); }, []);

  const lock = useCallback(() => {
    if (!isAuthenticated) return;
    if (location.pathname !== '/lock') localStorage.setItem('last_path_before_lock', location.pathname + location.search);
    sessionStorage.setItem(LOCK_KEY, 'true'); setIsLocked(true); navigate('/lock', { replace: true });
  }, [isAuthenticated, location.pathname, location.search, navigate]);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    if (!isAuthenticated || isLocked || location.pathname === '/lock') return;
    timer.current = setTimeout(lock, timeoutMinutes * 60 * 1000);
  }, [isAuthenticated, isLocked, location.pathname, lock, timeoutMinutes]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    if (isAuthenticated && !isLocked && location.pathname !== '/lock') { reset(); events.forEach((e) => window.addEventListener(e, reset, { passive: true })); }
    else if (!isAuthenticated) { sessionStorage.removeItem(LOCK_KEY); setIsLocked(false); }
    return () => { clearTimeout(timer.current); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [isAuthenticated, isLocked, location.pathname, reset]);

  // a locked screen stays on /lock whatever address is typed
  useEffect(() => { if (isLocked && isAuthenticated && location.pathname !== '/lock') navigate('/lock', { replace: true }); }, [isLocked, isAuthenticated, location.pathname, navigate]);

  const unlock = async (password) => {
    try {
      const r = await authService.verifyPassword({ password });
      sessionStorage.removeItem(LOCK_KEY); setIsLocked(false); showSuccess(r?.message || 'session_unlocked');
      const back = localStorage.getItem('last_path_before_lock') || '/dashboard'; localStorage.removeItem('last_path_before_lock');
      navigate(back === '/lock' ? '/dashboard' : back, { replace: true });
      return { success: true };
    } catch (err) { return { success: false, message: err?.message }; }
  };
  return <IdleLockContext.Provider value={{ isLocked, unlock, forceLock: lock, timeoutMinutes }}>{children}</IdleLockContext.Provider>;
}
export const useIdleLock = () => useContext(IdleLockContext);
