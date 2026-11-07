// FILE PATH: frontend/src/pages/purchases/common.jsx
import { useState, useEffect } from 'react';
import { Input, Select } from '../../components/ui';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { supplierService, productService } from '../../services/api';
import { t } from '../../utils/i18n';

const TONES = { green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', gray: 'bg-gray-100 text-gray-600', blue: 'bg-blue-50 text-blue-700' };
const TONE_OF = { approved: 'green', received: 'green', paid: 'green', passed: 'green', completed: 'green', active: 'green', credited: 'green',
  pending_approval: 'amber', pending_inspection: 'amber', partially_received: 'amber', partial: 'amber', pending: 'amber', draft: 'gray', unpaid: 'red', overdue: 'red',
  cancelled: 'red', canceled: 'red', rejected: 'red', failed: 'red', shipped: 'blue', received_by_supplier: 'blue' };

/** One status chip for every purchasing screen (same colours everywhere). */
export const PStatus = ({ value }) => {
  const { lang } = useLanguage();
  if (!value) return <span className="text-gray-400">—</span>;
  const k = String(value).toLowerCase();
  return <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${TONES[TONE_OF[k] || 'gray']}`}>{t(k, lang)}</span>;
};

/** Loads a whole paged list (suppliers, products) so pickers can search instantly. */
const loadAll = async (fetchPage, max = 60) => {
  const all = []; let page = 1; let pages = 1;
  do { const r = await fetchPage(page); all.push(...r.data); pages = r.pagination.totalPages; page += 1; } while (page <= pages && page <= max);
  return all;
};
export const useSuppliers = () => {
  const { currentStore } = useStore(); const [rows, setRows] = useState([]);
  useEffect(() => { if (currentStore?.id) loadAll((page) => supplierService.getAll({ page, limit: 100 })).then(setRows).catch(() => setRows([])); }, [currentStore?.id]);
  return rows;
};
export const useAllProducts = () => {
  const { currentStore } = useStore(); const [rows, setRows] = useState([]);
  useEffect(() => { if (currentStore?.id) loadAll((page) => productService.getAll({ page, limit: 100 })).then(setRows).catch(() => setRows([])); }, [currentStore?.id]);
  return rows;
};

/** Search + status + supplier + date range, the same layout on every purchasing list. */
export function PFilters({ list, statusOptions, statusKey = 'status', suppliers }) {
  const { lang } = useLanguage();
  const f = list.filters;
  return (
    <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} />
      {statusOptions && <Select value={f[statusKey] || ''} onChange={(e) => list.setFilter(statusKey, e.target.value)} options={[{ value: '', label: t('all', lang) }, ...statusOptions.map((o) => ({ value: o, label: t(o, lang) }))]} />}
      {suppliers && <Select searchable value={f.supplier_id || ''} onChange={(e) => list.setFilter('supplier_id', e.target.value)} options={[{ value: '', label: t('all_suppliers', lang) }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />}
      <Input type="date" value={f.from_date || ''} onChange={(e) => list.setFilter('from_date', e.target.value)} aria-label={t('start_date', lang)} />
      <Input type="date" value={f.to_date || ''} onChange={(e) => list.setFilter('to_date', e.target.value)} aria-label={t('end_date', lang)} />
    </div>
  );
}

/** A fetcher for useServerList from one of the purchaseService lists. */
export const listFetcher = (service, extraKeys = []) => async ({ page, limit, search, status, supplier_id, from_date, to_date, ...rest }) =>
  service.list({ page, limit, search: search || undefined, status: status || undefined, supplier_id: supplier_id || undefined, from_date: from_date || undefined, to_date: to_date || undefined, ...Object.fromEntries(extraKeys.map((k) => [k, rest[k] || undefined])) });

export const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
export const num = (v) => Number(v) || 0;
export const INITIAL = { search: '', status: '', supplier_id: '', from_date: '', to_date: '' };

export const Dl = ({ items }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-left">
    {items.map(([k, v]) => <div key={k}><p className="text-[11px] uppercase tracking-wide text-gray-400">{k}</p><div className="text-gray-800 break-words">{v || '—'}</div></div>)}
  </div>
);
