/**
 * dateFormat — a single configurable date format used everywhere the app
 * displays a date, instead of each page picking its own (toLocaleDateString,
 * hardcoded "Month Day, Year", etc). The chosen format is saved in
 * localStorage (Settings → General → Date Format) and read by every page
 * via usePreferences()/formatDate() from PreferencesContext.
 */

export const DATE_FORMAT_STORAGE_KEY = 'biztrack_date_format';

export const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '31/12/2025' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '12/31/2025' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2025-12-31' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY', example: '31-12-2025' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY', example: '31 Dec 2025' },
  { value: 'MMMM D, YYYY', label: 'MMMM D, YYYY', example: 'December 31, 2025' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const getStoredDateFormat = () => {
  try {
    return localStorage.getItem(DATE_FORMAT_STORAGE_KEY) || 'DD/MM/YYYY';
  } catch {
    return 'DD/MM/YYYY';
  }
};

export const setStoredDateFormat = (format) => {
  try {
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format);
  } catch { /* ignore (e.g. private browsing) */ }
};

/** Formats a Date object, ISO string, or anything `new Date()` accepts,
 * using the given format token string. Returns '' for invalid/empty input. */
export const formatDate = (dateInput, format = getStoredDateFormat()) => {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[d.getMonth()];
  const month = MONTHS_FULL[d.getMonth()];
  const day = d.getDate();

  switch (format) {
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD-MM-YYYY': return `${dd}-${mm}-${yyyy}`;
    case 'D MMM YYYY': return `${day} ${mon} ${yyyy}`;
    case 'MMMM D, YYYY': return `${month} ${day}, ${yyyy}`;
    case 'DD/MM/YYYY':
    default: return `${dd}/${mm}/${yyyy}`;
  }
};

/** Same as formatDate but also appends the time (HH:MM, 24h). */
export const formatDateTime = (dateInput, format) => {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d, format)} ${hh}:${min}`;
};
