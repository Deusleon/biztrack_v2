// A short table PDF attached to a notification email when the record has lines worth keeping.
import pool from '../config/db.js';
import { buildTablePdf } from './simplePdf.js';

export const pdfQty = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Number(v.toFixed(2)).toLocaleString('en-US');
};

export const pdfMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** @returns {Promise<{ filename: string, content: Buffer, contentType: string }[]>} */
export async function recordAttachment(storeId, { title, subtitle = '', filename, columns, rows, totals = null, index = true }) {
  const store = await pool.query('SELECT name, location FROM stores WHERE id = $1', [storeId]);
  const system = await pool.query('SELECT settings FROM system_settings LIMIT 1').catch(() => ({ rows: [] }));
  const info = system.rows[0]?.settings?.businessInfo || {};
  const row = store.rows[0] || {};
  const pdf = buildTablePdf({
    title,
    subtitle,
    businessName: info.businessName || row.name || 'BizTrack',
    address: info.address || row.location || '',
    phone: info.phone || '',
    email: info.email || '',
    columns,
    rows,
    totals,
    index,
  });
  const safe = String(filename || 'record.pdf').replace(/[^\w.-]+/g, '-');
  return [{ filename: safe.endsWith('.pdf') ? safe : `${safe}.pdf`, content: pdf, contentType: 'application/pdf' }];
}

/** One-record PDF (an adjustment, a payment): a short table plus the store letterhead. Never throws. */
export async function singleRecordAttachment(storeId, { title, subtitle = '', filename, columns, row, totals = null }) {
  try {
    return await recordAttachment(storeId, { title, subtitle, filename, columns, rows: [row], totals });
  } catch {
    return undefined;
  }
}
