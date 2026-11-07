/**
 * PreferencesContext — small display/print preferences that should apply
 * consistently across the whole app, editable from Settings → General:
 *   - Date format (how every date is displayed)
 *   - Default receipt print size (A4 / A5 / Thermal 80mm / Thermal 58mm)
 *   - Money decimal places (how many decimals to show for TZS amounts)
 *
 * One setting for the whole store, kept on the server (tenants.settings.display) so
 * every user — and every message the server writes — follows the same standard. The
 * copy in localStorage is only a cache: it paints the first screen correctly and lets
 * plain helper functions (PDF/Excel exports) read the setting without a hook.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { settingsService } from '../services/api';
import { getStoredDateFormat, setStoredDateFormat, formatDate as formatDateWith, formatDateTime as formatDateTimeWith } from '../utils/dateFormat';
import { MONEY_DECIMALS_STORAGE_KEY, getMoneyDecimals, formatMoney as formatMoneyWith } from '../utils/money';

const PreferencesContext = createContext(null);

export const RECEIPT_SIZES = [
  // { value: 'a4', label: 'A4 (full page)' },
  { value: 'a5', label: 'A5 (half page)' },
  { value: 'thermal80', label: 'Thermal 80mm' },
  { value: 'thermal58', label: 'Thermal 58mm' },
];

export const MONEY_DECIMAL_OPTIONS = [
  { value: 0, label: 'No decimals (e.g. TZS 12,000)' },
  { value: 2, label: '2 decimals (e.g. TZS 12,000.00)' },
];

const RECEIPT_SIZE_STORAGE_KEY = 'biztrack_default_receipt_size';

const DEFAULT_RECEIPT_SIZE = 'a5';

/** Reads the saved size, falling back to A5 whenever the stored value
 * isn't one we currently offer. Without this check, a value saved while
 * a size was still available (e.g. the retired 'a4') would survive in
 * localStorage and leave the receipt toolbar with nothing selected. */
const getStoredReceiptSize = () => {
  try {
    const stored = localStorage.getItem(RECEIPT_SIZE_STORAGE_KEY);
    return RECEIPT_SIZES.some((s) => s.value === stored) ? stored : DEFAULT_RECEIPT_SIZE;
  } catch {
    return DEFAULT_RECEIPT_SIZE;
  }
};

const getStoredMoneyDecimals = getMoneyDecimals;

export const PreferencesProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [dateFormat, setDateFormatState] = useState(getStoredDateFormat);
  const [defaultReceiptSize, setDefaultReceiptSizeState] = useState(getStoredReceiptSize);
  const [moneyDecimals, setMoneyDecimalsState] = useState(getStoredMoneyDecimals);

  const cacheDateFormat = (format) => { setDateFormatState(format); setStoredDateFormat(format); };
  const cacheReceiptSize = (size) => { setDefaultReceiptSizeState(size); try { localStorage.setItem(RECEIPT_SIZE_STORAGE_KEY, size); } catch { /* ignore */ } };
  const cacheMoneyDecimals = (decimals) => { setMoneyDecimalsState(decimals); try { localStorage.setItem(MONEY_DECIMALS_STORAGE_KEY, String(decimals)); } catch { /* ignore */ } };

  // The store's setting wins over whatever this browser remembered.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    settingsService.getOverview()
      .then((res) => {
        const d = res?.data?.display;
        if (cancelled || !d) return;
        if (d.date_format) cacheDateFormat(d.date_format);
        if (RECEIPT_SIZES.some((s) => s.value === d.receipt_size)) cacheReceiptSize(d.receipt_size);
        if (d.money_decimals !== undefined) cacheMoneyDecimals(Number(d.money_decimals));
      })
      .catch(() => { /* e.g. a locked store: keep what this browser has */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // Saves for the whole store. Shows the change at once, puts it back if the server refuses.
  const save = useCallback(async (patch, apply, previous) => {
    apply();
    try {
      await settingsService.updateDisplay(patch);
    } catch (err) {
      previous();
      throw err;
    }
  }, []);

  const setDateFormat = useCallback((format) => save({ date_format: format }, () => cacheDateFormat(format), () => cacheDateFormat(dateFormat)), [save, dateFormat]);
  const setDefaultReceiptSize = useCallback((size) => save({ receipt_size: size }, () => cacheReceiptSize(size), () => cacheReceiptSize(defaultReceiptSize)), [save, defaultReceiptSize]);
  const setMoneyDecimals = useCallback((decimals) => save({ money_decimals: decimals }, () => cacheMoneyDecimals(decimals), () => cacheMoneyDecimals(moneyDecimals)), [save, moneyDecimals]);

  return (
    <PreferencesContext.Provider
      value={{
        dateFormat,
        setDateFormat,
        /** Format any date using the currently selected format. */
        formatDate: (date) => formatDateWith(date, dateFormat),
        formatDateTime: (date) => formatDateTimeWith(date, dateFormat),
        defaultReceiptSize,
        setDefaultReceiptSize,
        moneyDecimals,
        setMoneyDecimals,
        /** Format a TZS amount using the currently selected decimal
         * preference — e.g. "TZS 12,000" or "TZS 12,000.00". */
        formatMoney: (amount) => formatMoneyWith(amount, 'TZS', moneyDecimals),
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
