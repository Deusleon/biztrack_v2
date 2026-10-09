// FILE PATH: frontend/src/pages/sales/common.jsx
import { Input, Select, DatePicker } from '../../components/ui';
import { useLanguage } from '../../contexts/LanguageContext';
import { t } from '../../utils/i18n';

const TONES = { green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', gray: 'bg-gray-100 text-gray-600', blue: 'bg-blue-50 text-blue-700' };
const STATUS_TONE = { paid: 'green', completed: 'green', approved: 'green', active: 'green', sold: 'green', cash: 'green', partial_paid: 'amber', partial: 'amber', pending: 'amber', saved: 'amber', onprocess: 'amber', credit: 'blue', overdue: 'red', unpaid: 'red', rejected: 'red', cancelled: 'red', canceled: 'red' };
export const StatusBadge = ({ value }) => {
  const { lang } = useLanguage();
  if (!value) return <span className="text-gray-400">—</span>;
  const key = String(value).toLowerCase() === 'saved' ? 'pending' : String(value).toLowerCase();     // a waiting order is stored as "Saved"
  const tone = TONES[STATUS_TONE[key] || 'gray'];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${tone}`}>{t(key, lang)}</span>;
};

/** Search + optional status/type + date range, laid out the same on every sales list. */
export function FilterBar({ list, statusOptions, statusKey = 'status', dates = true }) {
  const { lang } = useLanguage();
  const f = list.filters;
  return (
    <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} />
      {statusOptions && <Select value={f[statusKey] || ''} onChange={(e) => list.setFilter(statusKey, e.target.value)} options={[{ value: '', label: t('all', lang) }, ...statusOptions.map((o) => ({ value: o, label: t(o, lang) }))]} />}
      {dates && <DatePicker value={f.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} />}
      {dates && <DatePicker align="right" value={f.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} />}
    </div>
  );
}

/** Server paging block { total, page, limit, totalPages } → the DataTable's { totalItems, currentPage, … } */
export const toPaging = (p = {}, limit = 25) => ({ currentPage: p.page ?? 1, totalPages: p.totalPages ?? 1, totalItems: p.total ?? 0, limit: p.limit ?? limit });
export const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');

const SYSTEM_NOTE = /^order_modified_on_(.+)_by_[0-9a-f-]{36}$/i;
/** A saved edit used to stamp the cart with a timestamp and a user id. Show a date instead. */
export const readableNote = (note, lang) => {
  if (!note) return '';
  const match = String(note).match(SYSTEM_NOTE);
  if (!match) return note;
  const when = new Date(match[1]);
  const date = Number.isNaN(when.getTime()) ? match[1].replace('T', ' ').replace(/Z$/, '') : when.toLocaleString();
  return t('order_updated_on', lang, { date });
};
/** Edit used to insert a fake payment whose method was "mod_by_<user id>". That is not a payment. */
export const isSystemPayment = (method) => /^mod_by_/i.test(String(method || ''));
export const readableMethod = (method, lang) => (isSystemPayment(method) ? t('order_update', lang) : t(method, lang));
