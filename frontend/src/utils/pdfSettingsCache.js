// utils/pdfSettingsCache.js
// What the PDF/Excel/CSV export engine remembers about the store's settings (currency, decimals, business name…).
// Kept apart from exportUtils.js so the Configuration page can reset it without downloading the PDF and Excel libraries.
export const pdfSettingsCache = { settings: null, promise: null };

/** After the store's settings change, the next PDF must read the new ones. */
export const clearPdfSettingsCache = () => { pdfSettingsCache.settings = null; pdfSettingsCache.promise = null; };
