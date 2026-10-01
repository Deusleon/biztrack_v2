// FILE PATH: frontend/src/pages/reports/format.js
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

/** What kind of value a report column holds, from its NAME (every report endpoint uses the same naming). */
export const kindOf = (key) => {
  const k = key.toLowerCase();
  if (/(^|_)(status|sale_type|adjustment_type|movement_type|payment_method|refund_method|return_reason|reason|condition|batch_status|aging_group|unit)$/.test(k)) return 'label';
  if (/(percentage|margin|rate)$/.test(k) && !/(price|cost)/.test(k)) return 'percent';
  if (/(^|_)(date|created_at|received_at|period)$/.test(k) || k.endsWith('_date')) return 'date';
  if (/(^|_)(phone|number|name|note|notes|batch_number|barcode|mode|supplier_invoice_number|bill_number|reference_number|po_number|grn_number)$/.test(k) || k.endsWith('_number') || k.endsWith('_name') || k.endsWith('_phone') || k === 'discount_mode') return 'text';
  if (/(amount|price|cost|revenue|profit|loss|value|balance|outstanding|paid|due|payable|worth|expenses|shipping|charges|tax|invoiced|discount)/.test(k) && !/(count|invoices|orders|_qty|quantity|items|days)$/.test(k) && !/^(total_invoices|total_orders|total_suppliers|total_products|total_batches|total_periods|total_days|total_transactions|total_items_sold|total_quantity_sold|total_quantity)$/.test(k)) return 'money';
  if (/(quantity|qty|count|invoices|orders|items|stock|days|total_in|total_out|minimum|products|categories|suppliers|batches|periods|transactions|returns|transfers)/.test(k)) return 'number';
  return 'text';
};

export const hiddenColumn = (k) => k === 'id' || k.endsWith('_id') || k === 'is_unlinked_legacy_row' || k.startsWith('has_') || k.startsWith('is_');

const humanize = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const labelOf = (key, lang) => { const v = t(key, lang); return v === key ? humanize(key) : v; };

export const formatValue = (key, v, { settings, lang }) => {
  if (v === null || v === undefined || v === '') return '—';
  switch (kindOf(key)) {
    case 'money': return formatCurrency(Number(v) || 0, settings);
    case 'number': return formatNumberWithCommas(Number(v) || 0);
    case 'percent': return `${(Number(v) || 0).toFixed(1)}%`;
    case 'date': return String(v).slice(0, /^\d{4}-\d{2}$/.test(String(v)) ? 7 : 10);
    case 'label': { const x = t(String(v).toLowerCase(), lang); return x === String(v).toLowerCase() ? String(v) : x; }
    default: return String(v);
  }
};

/** Columns for a result: every key of the first rows, minus ids; the order the server gives. */
export const columnsFor = (rows) => {
  const seen = new Set(); const cols = [];
  rows.slice(0, 20).forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k) && !hiddenColumn(k)) { seen.add(k); cols.push(k); } }));
  return cols;
};
