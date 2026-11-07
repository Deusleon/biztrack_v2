// Keeps every phone field in the app storing the same shape: digits only,
// in "255XXXXXXXXX" form (country code, no leading '+'). Mirrors
// backend/src/controllers/contactController.js's normalizeContactPhone so
// what's typed matches what's ultimately stored.

/** Strips everything that isn't a digit — used on every keystroke so the
 * field can never contain letters/symbols, only numbers. */
export const digitsOnly = (value) => (value || "").replace(/\D/g, "");

/** Converts a local "07XXXXXXXX" number to "2557XXXXXXXX". Leaves
 * already-international numbers (or anything else) alone. */
export const toTanzaniaFormat = (digits) => {
  if (!digits) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "255" + digits.slice(1);
  return digits;
};

/** Full normalize used both while typing and on submit. */
export const normalizePhoneInput = (value) => toTanzaniaFormat(digitsOnly(value));

/** Max length for a normalized TZ number: "255" + 9 digits = 12. Kept a
 * little looser (15) to not block someone entering a different country's
 * number, since we only auto-convert the 0-prefixed local TZ shape. */
export const PHONE_MAX_LENGTH = 15;
