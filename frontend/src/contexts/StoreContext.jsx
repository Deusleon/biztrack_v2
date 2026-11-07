// FILE PATH: frontend/src/contexts/StoreContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { storeService, authService } from '../services/api';

const StoreContext = createContext(null);

/**
 * The shop the person is working in. BizTrack keeps a role and a set of permissions PER STORE, so switching
 * store asks the server for the person's role in the target store, swaps the permissions, and every page
 * that depends on `currentStore.id` loads its data again — no full page reload.
 */
export const StoreProvider = ({ children }) => {
  const { user, applyStoreSwitch } = useAuth();
  const [stores, setStores] = useState([]);
  const [currentStore, setCurrentStoreState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const remember = (store) => {
    localStorage.setItem('currentStoreId', store.id);
    localStorage.setItem('currentStoreName', store.name);
  };

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const res = await storeService.getMine();
      const list = res.data;
      setStores(list);

      // Which one to open: the one used last → the store set as default → the first.
      let chosen = list.find((s) => s.id === localStorage.getItem('currentStoreId')) || null;
      if (!chosen) {
        try { const d = await storeService.getDefault(); chosen = list.find((s) => s.id === d.data?.id) || null; } catch { /* no default set */ }
      }
      if (!chosen) chosen = list[0] || null;
      if (chosen) { remember(chosen); setCurrentStoreState(chosen); }
    } catch (err) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) { setStores([]); setCurrentStoreState(null); setLoading(false); return; }
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** Returns true when the switch worked. */
  const setCurrentStore = async (storeId) => {
    const target = stores.find((s) => s.id === storeId);
    if (!target || target.id === currentStore?.id) return false;
    try {
      setSwitching(true);
      const res = await authService.switchStore(storeId);
      remember(target);                       // the request header must carry the NEW store from now on
      applyStoreSwitch(res);                  // role, permissions, fresh token
      setCurrentStoreState(target);
      return true;
    } catch (err) {
      console.error('Failed to switch store:', err);
      throw err;
    } finally {
      setSwitching(false);
    }
  };

  const value = { stores, currentStore, setCurrentStore, canSwitchStore: stores.length > 1, loading, switching, refreshStores: loadStores };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
};
