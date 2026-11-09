// FILE PATH: backend/src/utils/phoneNumber.js
/**
 * A phone number the way SMS gateways want it: digits only, international format without '+' (255712345678).
 * Accepts "+255 712 345 678", "0712-345-678" (Tanzanian local → 255…) and plain 255712345678; returns null for anything else
 * (not 11–15 digits).
 */
export function normalizeContactPhone(raw) {
  let d = String(raw ?? '').replace(/[^\d]/g, '');
  if (d.length === 10 && d.startsWith('0')) d = `255${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
