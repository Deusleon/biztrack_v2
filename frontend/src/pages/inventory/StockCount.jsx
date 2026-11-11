// FILE PATH: frontend/src/pages/inventory/StockCount.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { stockCountService, categoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import { DataTable, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging, dateOnly, DetailGrid } from '../sales/common';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const num = (v) => Number(v) || 0;
const fetchProducts = async ({ page, limit, search, category_id }) => {
  const r = await stockCountService.products({ page, limit, search: search || '', category_id: category_id || undefined });
  return { data: r.products || [], pagination: toPaging(r.pagination, limit) };
};
const fetchHistory = async ({ page, limit, startDate, endDate }) => {
  const r = await stockCountService.history({ page, limit, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.stockCounts || [], pagination: toPaging(r.pagination, limit) };
};

const fetchMovements = async ({ page, limit, search, movement_type, startDate, endDate }) => {
  const r = await stockCountService.movements({ page, limit, search: search || '', movement_type: movement_type || 'IN', startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.movements || [], pagination: toPaging(r.pagination, limit), summary: r.summary };
};

export default function StockCount() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const canCount = can('create_stock_count'); const canHistory = can('view_stock_count');
  const [tab, setTab] = useState(canCount ? 'count' : 'history');   // count | history | movements
  const [cats, setCats] = useState([]);
  const [counted, setCounted] = useState({});         // product_id → counted quantity typed so far (kept across pages)
  const [names, setNames] = useState({});
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const products = useServerList({ fetcher: fetchProducts, initialFilters: { search: '', category_id: '' }, enabled: tab === 'count' && canCount });
  const history = useServerList({ fetcher: fetchHistory, initialFilters: { startDate: '', endDate: '' }, enabled: tab === 'history' && canHistory });
  const moves = useServerList({ fetcher: fetchMovements, initialFilters: { search: '', movement_type: 'IN', startDate: '', endDate: '' }, enabled: tab === 'movements' && canHistory });
  useEffect(() => { categoryService.getAll({ limit: 500 }).then((r) => setCats(r.data)).catch(() => {}); setCounted({}); }, [currentStore?.id]);

  const entries = Object.entries(counted).filter(([, v]) => v !== '' && v != null);
  const setCount = (p, v) => { setCounted((c) => ({ ...c, [p.product_id]: v })); setNames((n) => ({ ...n, [p.product_id]: p.product_name })); };
  const save = async () => {
    try {
      setSaving(true);
      const r = await stockCountService.save({ items: entries.map(([product_id, v]) => ({ product_id, counted_qty: num(v) })), notes });
      showSuccess(r.message || 'stock_count_saved'); setConfirm(false); setCounted({}); setNotes(''); products.reload(); history.reload();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const open = async (h) => { try { setDetail((await stockCountService.detail(h.id)).stockCount); } catch (err) { showError(err.message); } };

  const pcols = [
    { key: 'product_name', label: t('product_name', lang), render: (p) => <span className="font-medium text-gray-900">{p.product_name}</span> },
    { key: 'category_name', label: t('category', lang), render: (p) => p.category_name || '—' },
    { key: 'system_stock', label: t('system_stock', lang), align: 'right', render: (p) => `${formatNumberWithCommas(p.system_stock)} ${t(p.unit, lang)}` },
    { key: 'counted', label: t('counted_quantity', lang), align: 'right', render: (p) => <input className="w-28 px-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-20" inputMode="decimal" value={counted[p.product_id] ?? ''} onChange={(e) => setCount(p, e.target.value)} placeholder="—" /> },
    { key: 'difference', label: t('difference', lang), align: 'right', render: (p) => { const v = counted[p.product_id]; if (v === '' || v == null) return <span className="text-gray-300">—</span>; const dlt = num(v) - num(p.system_stock); return <span className={dlt === 0 ? 'text-gray-500' : dlt > 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>{dlt > 0 ? '+' : ''}{formatNumberWithCommas(dlt)}</span>; } },
  ];
  const hcols = [
    { key: 'reference_number', label: t('reference', lang), render: (h) => <span className="font-medium text-gray-900">{h.reference_number}</span> },
    { key: 'created_at', label: t('date', lang), render: (h) => dateOnly(h.created_at) },
    { key: 'items_checked', label: t('items_checked', lang), align: 'right', render: (h) => h.items_checked ?? h.total_items ?? '—' },
    { key: 'adjustments_made', label: t('adjustments_made', lang), align: 'right', render: (h) => h.adjustments_made ?? '—' },
    { key: 'created_by_name', label: t('created_by', lang), render: (h) => h.created_by_name || '—' },
  ];
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('stock_count', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_stock_count', lang)}</p></div>
          {tab === 'count' && canCount && <Button disabled={entries.length === 0} onClick={() => setConfirm(true)}>{t('save_stock_count', lang)} ({entries.length})</Button>}
        </div>
        <div className="flex gap-2 border-b border-gray-200">{[['count', canCount, 'count_stock'], ['history', canHistory, 'count_history'], ['movements', canHistory, 'stock_movements']].filter(([, ok]) => ok).map(([k, , label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t(label, lang)}</button>)}</div>

        {tab === 'count' && canCount && (<>
          <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Input value={products.searchText} onChange={(e) => products.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /><Select searchable value={products.filters.category_id || ''} onChange={(e) => products.setFilter('category_id', e.target.value)} options={[{ value: '', label: t('all_categories', lang) }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} /></div>
          <p className="text-xs text-gray-500 text-left">{t('stock_count_help', lang)}</p>
          <DataTable columns={pcols} data={products.rows} loading={products.loading} rowId="product_id" emptyMessage={t('ui_nothing_yet', lang)} pagination={products.pagination} onPageChange={products.setPage} />
        </>)}
        {tab === 'movements' && canHistory && (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['total_movements', moves.summary?.total_movements], ['total_quantity', formatNumberWithCommas(moves.summary?.total_quantity)]].map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1">{v ?? 0}</p></div>)}</div>
          <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Select value={moves.filters.movement_type || 'IN'} onChange={(e) => moves.setFilter('movement_type', e.target.value)} options={[{ value: 'IN', label: t('incoming_stock', lang) }, { value: 'OUT', label: t('outgoing_stock', lang) }]} />
            <Input value={moves.searchText} onChange={(e) => moves.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} />
            <DatePicker value={moves.filters.startDate || ''} onChange={(e) => moves.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} />
            <DatePicker align="right" value={moves.filters.endDate || ''} onChange={(e) => moves.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} />
          </div>
          <DataTable columns={[
            { key: 'created_at', label: t('date', lang), render: (m) => dateOnly(m.created_at) },
            { key: 'product_name', label: t('product_name', lang), render: (m) => <span className="font-medium text-gray-900">{m.product_name}</span> },
            { key: 'category_name', label: t('category', lang), render: (m) => m.category_name || '—' },
            { key: 'batch_number', label: t('batch_number', lang), render: (m) => m.batch_number || '—' },
            { key: 'quantity', label: t('quantity', lang), align: 'right', render: (m) => `${formatNumberWithCommas(m.quantity)} ${t(m.product_unit, lang)}` },
            { key: 'note', label: t('notes', lang), render: (m) => m.note || '—' },
            { key: 'created_by_name', label: t('created_by', lang), render: (m) => m.created_by_name || '—' },
          ]} data={moves.rows} loading={moves.loading} emptyMessage={moves.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={moves.pagination} onPageChange={moves.setPage} />
        </>)}
        {tab === 'history' && canHistory && (<>
          <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><DatePicker value={history.filters.startDate || ''} onChange={(e) => history.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} /><DatePicker align="right" value={history.filters.endDate || ''} onChange={(e) => history.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} /></div>
          <DataTable columns={hcols} data={history.rows} loading={history.loading} emptyMessage={history.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={history.pagination} onPageChange={history.setPage} renderActions={(h) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(h) }]} />} />
        </>)}
      </div>

      <FormModal isOpen={confirm} onClose={() => !saving && setConfirm(false)} size="lg" title={t('save_stock_count', lang)}>
        <div className="space-y-4 text-left"><p className="text-sm text-gray-600">{t('stock_count_confirm', lang, { count: entries.length })}</p><Textarea rows={2} label={t('notes', lang)} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="overflow-x-auto border border-gray-200 rounded-md max-h-64"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('counted_quantity', lang)}</th></tr></thead>
            <tbody>{entries.map(([id, v]) => <tr key={id} className="border-t border-gray-100"><td className="px-3 py-2.5">{names[id]}</td><td className="px-3 py-2.5 text-right font-medium">{v}</td></tr>)}</tbody></table></div>
          <div className="flex justify-end gap-3"><Button loading={saving} onClick={save}>{t('save', lang)}</Button><Button variant="secondary" onClick={() => setConfirm(false)}>{t('ui_cancel', lang)}</Button></div></div>
      </FormModal>
      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('stock_count', lang)} ${d?.reference_number || ''}`}>
        {d && (<div className="space-y-5 text-left">
          <DetailGrid items={[[t('date', lang), dateOnly(d.created_at)], [t('created_by', lang), d.created_by_name], [t('items_checked', lang), d.items_checked ?? (d.items || []).length], [t('adjustments_made', lang), d.adjustments_made ?? (d.items || []).filter((i) => num(i.difference) !== 0).length]]} />
          <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('system_stock', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('counted_quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('difference', lang)}</th></tr></thead>
            <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2.5">{i.product_name}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(i.system_qty)}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(i.counted_qty)}</td><td className={`px-3 py-2.5 text-right font-medium ${num(i.difference) < 0 ? 'text-red-600' : num(i.difference) > 0 ? 'text-green-700' : ''}`}>{num(i.difference) > 0 ? '+' : ''}{formatNumberWithCommas(i.difference)}</td></tr>)}</tbody></table></div>
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600"><p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>{d.notes || '—'}</div>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div></div>)}
      </FormModal>
    </MainLayout>
  );
}
