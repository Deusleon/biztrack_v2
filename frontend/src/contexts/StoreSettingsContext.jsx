// src/context/StoreSettingsContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useStore } from "./StoreContext";
import { getStoreSettings } from "../services/SettingsService";

const StoreSettingsContext = createContext();

const CACHE_KEY = "cachedStoreSettings";
const CACHE_STORE_KEY = "cachedStoreSettingsStoreId";

/** Read cached settings synchronously from localStorage, but only if they
 *  belong to the store that is currently selected — otherwise ignore them
 *  (prevents showing store A's settings while store B is loading). */
function readCache(storeId) {
  try {
    if (!storeId) return null;
    const cachedStoreId = localStorage.getItem(CACHE_STORE_KEY);
    if (cachedStoreId !== storeId) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Store Settings Provider
 * Fetches store settings ONCE per store (instead of on every component that
 * needs them) and shares the result app-wide via context. This removes the
 * duplicate network requests that were happening on almost every page, and
 * removes the "blink" where numbers/format briefly show with default values
 * before the real settings arrive.
 */
export const StoreSettingsProvider = ({ children }) => {
  const { currentStore } = useStore();
  const storeId = currentStore?.id || localStorage.getItem("currentStoreId");

  const [settings, setSettings] = useState(() => readCache(storeId) ?? {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    const currentStoreId = localStorage.getItem("currentStoreId");

    if (!currentStoreId) {
      setLoading(false);
      return;
    }

    try {
      // Only show a loading state if we don't already have cached settings
      // to display (avoids an unnecessary flash on subsequent navigations).
      const hasCache = readCache(currentStoreId) !== null;
      if (!hasCache) setLoading(true);
      setError(null);

      const res = await getStoreSettings(currentStoreId);
      const operations = {
        ...res.data.systemSettings.businessInfo,
        ...res.data.systemSettings.systemDefaults,
        ...res.data.storeSettings.operations,
        ...res.data.storeSettings.branding,
      };

      setSettings(operations);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(operations));
        localStorage.setItem(CACHE_STORE_KEY, currentStoreId);
      } catch {
        /* storage full — ignore, cache is a nice-to-have */
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setError(err);
      // Only fall back to bare defaults if we truly have nothing cached.
      if (readCache(currentStoreId) === null) {
        setSettings({
          allowExpireDate: false,
          allowNegativeStock: false,
          showCurrency: false,
          defaultCurrency: "",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const value = {
    settings,
    loading,
    error,
    refetch: fetchSettings,
  };

  return (
    <StoreSettingsContext.Provider value={value}>
      {children}
    </StoreSettingsContext.Provider>
  );
};

/**
 * Hook to read store settings from the shared context.
 * Falls back gracefully (returns loading=false, empty settings) if used
 * outside the provider, so nothing crashes if a component is rendered in
 * isolation (e.g. in a test).
 */
export const useStoreSettingsContext = () => {
  const context = useContext(StoreSettingsContext);
  if (!context) {
    return { settings: {}, loading: false, error: null, refetch: () => {} };
  }
  return context;
};
