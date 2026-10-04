// FILE PATH: frontend/src/pages/messaging/common.js
/** Phone number the way SMS gateways want it (same rule as the server): digits only, 255712345678; null when invalid. */
export const normalizePhone = (raw) => { let d = String(raw ?? '').replace(/[^\d]/g, ''); if (d.length === 10 && d.startsWith('0')) d = `255${d.slice(1)}`; return d.length >= 11 && d.length <= 15 ? d : null; };
/** How many SMS a text will cost: 160 characters per part (153 once it needs several); 70 / 67 with non-GSM characters (emoji, accents). */
const GSM_EXTRA = '£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€';
export const smsParts = (text) => { const str = String(text || ''); if (!str.length) return 0; const unicode = [...str].some((ch) => ch.charCodeAt(0) > 127 && !GSM_EXTRA.includes(ch)); const single = unicode ? 70 : 160; const multi = unicode ? 67 : 153; return str.length <= single ? 1 : Math.ceil(str.length / multi); };
export const dateTime = (v) => (v ? new Date(v).toLocaleString() : '—');
