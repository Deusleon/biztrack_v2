// FILE PATH: frontend/src/pages/sales/common.jsx
import { Input, Select } from '../../components/ui';
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
      {dates && <Input type="date" value={f.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} aria-label={t('start_date', lang)} />}
      {dates && <Input type="date" value={f.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} aria-label={t('end_date', lang)} />}
    </div>
  );
}

/** Server paging block { total, page, limit, totalPages } → the DataTable's { totalItems, currentPage, … } */
export const toPaging = (p = {}, limit = 25) => ({ currentPage: p.page ?? 1, totalPages: p.totalPages ?? 1, totalItems: p.total ?? 0, limit: p.limit ?? limit });
export const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
