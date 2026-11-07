/**
 * One place that decides how every money amount in BizTrack is written, so the
 * whole system follows Settings → General → Money Decimals (0 or 2 decimals).
 *
 * The setting lives in localStorage (see contexts/PreferencesContext). Reading it
 * here, instead of only inside a React hook, means PDFs, Excel exports and plain
 * helper functions follow it too — not just components.
 *
 *   formatMoney(12000)        → "TZS 12,000"      or "TZS 12,000.00"
 *   formatNumber(12000)       → "12,000"          or "12,000.00"   (no currency)
 *   formatMoneyOrDash(0)      → "—"                               (nothing owed / no value)
 */
export const MONEY_DECIMALS_STORAGE_KEY = 'biztrack_money_decimals';

export const getMoneyDecimals = () => {
  try {
    const raw = localStorage.getItem(MONEY_DECIMALS_STORAGE_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
  } catch {
    return 0;
  }
};

// A fixed locale, so "12,000.50" never turns into "12.000,50" on a browser set to another language.
const LOCALE = 'en-US';

export const formatNumber = (amount, decimals = getMoneyDecimals()) => {
  const n = Number(amount);
  return (Number.isFinite(n) ? n : 0).toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export const formatMoney = (amount, currency = 'TZS', decimals = getMoneyDecimals()) => `${currency} ${formatNumber(amount, decimals)}`;

export const formatMoneyOrDash = (amount, currency = 'TZS', decimals = getMoneyDecimals()) => (Number(amount) ? formatMoney(amount, currency, decimals) : '—');
