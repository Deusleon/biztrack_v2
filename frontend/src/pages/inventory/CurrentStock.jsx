// FILE PATH: frontend/src/pages/inventory/CurrentStock.jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { inventoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, Button, RowActions, ACTION_ICONS, Input, Select, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging, dateOnly } from '../sales/common';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const FILTERS = ['all', 'in-stock', 'low-stock', 'out-of-stock'];
const FILTER_LABEL = { all: 'all', 'in-stock': 'in_stock', 'low-stock': 'low_stock', 'out-of-stock': 'out_of_stock' };
const fetchStock = async ({ page, limit, search, stockFilter }) => {
  const r = await inventoryService.storeStock({ page, limit, search: search || undefined, stockFilter: stockFilter || 'all' });
  return { data: r.stock || [], pagination: toPaging(r.pagination, limit), summary: r.summary };
};
const num = (v) => Number(v) || 0;

export default function CurrentStock() {
  const { can } = useAuth();
  const { showError, showSuccess } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const list = useServerList({ fetcher: fetchStock, initialFilters: { search: '', stockFilter: 'all' } });
  useLiveRefresh(['stockUpdated', 'newSale', 'grnCreated', 'stockAdjusted'], list.reload);
  const [risk, setRisk] = useState({});             // product_id → soonest-expiring batch at risk
  const [detail, setDetail] = useState(null);       // { row, batches }
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const showExpiry = !!settings?.allowExpireDate;
  const canEditBatch = can('edit_batch');

  useEffect(() => {
    if (!showExpiry) { setRisk({}); return; }
    inventoryService.expiryRisk(30).then((r) => { const m = {}; (r.at_risk_batches || []).forEach((b) => { const k = b.product_id || b.id; if (!m[k] || b.expiry_date < m[k].expiry_date) m[k] = b; }); setRisk(m); }).catch(() => setRisk({}));
  }, [showExpiry, currentStore?.id, list.rows.length]);

  const open = async (row) => { try { const r = await inventoryService.batchDetails(row.product_id); setDetail({ row, batches: r.batches || [] }); } catch (err) { showError(err.message); } };
  const saveBatch = async () => {
    try { setSaving(true); const r = await inventoryService.updateBatch({ batch_id: edit.id, batch_number: edit.batch_number, cost_price: num(edit.cost_price), expiry_date: edit.expiry_date || undefined }); showSuccess(r.message); setEdit(null); if (detail) { const d = await inventoryService.batchDetails(detail.row.product_id); setDetail({ ...detail, batches: d.batches || [] }); } list.reload(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const level = (r) => (num(r.current_stock) <= 0 ? 'out' : num(r.current_stock) <= num(r.minimum_stock) ? 'low' : 'ok');
  const columns = [
    { key: 'product_name', label: t('product_name', lang), render: (r) => <span className="font-medium text-gray-900">{r.product_name}</span> },
    { key: 'category_name', label: t('category', lang), render: (r) => r.category_name || t('not_specified', lang) },
    { key: 'current_stock', label: t('current_stock', lang), align: 'right', render: (r) => <span className={level(r) === 'ok' ? '' : 'text-red-600 font-medium'}>{formatNumberWithCommas(r.current_stock)} {t(r.unit, lang)}</span> },
    { key: 'minimum_stock', label: t('alert_qty', lang), align: 'right', render: (r) => formatNumberWithCommas(r.minimum_stock) },
    { key: 'level', label: t('status', lang), render: (r) => { const lv = level(r); const rk = risk[r.product_id]; return <div className="flex gap-1 flex-wrap"><span className={`px-2 py-0.5 rounded text-xs font-medium ${lv === 'out' ? 'bg-red-50 text-red-700' : lv === 'low' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{t(lv === 'out' ? 'out_of_stock_item' : lv === 'low' ? 'low_stock_item' : 'in_stock', lang)}</span>{rk && <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700" title={dateOnly(rk.expiry_date)}>{t('expiring_soon', lang)}</span>}</div>; } },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'product_name', title: 'product_name' }, { key: 'category_name', title: 'category' }, { key: 'current_stock', title: 'current_stock' }, { key: 'minimum_stock', title: 'alert_qty' }];
  const toRows = (rows, off = 0) => rows.map((r, i) => ({ index: `${off + i + 1}.`, product_name: r.product_name, category_name: r.category_name || '', current_stock: `${t(r.unit, lang)} ${formatNumberWithCommas(r.current_stock)}`, minimum_stock: formatNumberWithCommas(r.minimum_stock) }));
  const exportRows = useMemo(() => toRows(list.rows, (list.pagination.currentPage - 1) * list.pagination.limit), [list.rows, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadAll = async () => { const all = []; let p = 1; let pages = 1; do { const r = await fetchStock({ ...list.filters, page: p, limit: 100 }); all.push(...r.data); pages = r.pagination.totalPages; p += 1; } while (p <= pages && p <= 200); return toRows(all); };
  const sm = list.summary || {};

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('current_stock', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_inventory_stock', lang)}</p></div>
          {(can('export_inventory_pdf') || can('view_current_stock')) && <ExportMenu rows={exportRows} columns={exportCols} title="current_stock" loadRows={loadAll} disabled={list.loading || list.rows.length === 0} />}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['all', sm.all_total], ['in-stock', sm.in_stock_count], ['low-stock', sm.low_stock_count], ['out-of-stock', sm.out_of_stock_count]].map(([k, v]) => (
            <button key={k} type="button" onClick={() => list.setFilter('stockFilter', k)} className={`bg-white p-4 rounded shadow text-left border-2 ${list.filters.stockFilter === k ? 'border-primary' : 'border-transparent'}`}><p className="text-xs uppercase tracking-wide text-gray-400">{t(FILTER_LABEL[k], lang)}</p><p className="text-xl font-bold text-gray-900 mt-1">{v ?? 0}</p></button>
          ))}
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /><Select value={list.filters.stockFilter || 'all'} onChange={(e) => list.setFilter('stockFilter', e.target.value)} options={FILTERS.map((f) => ({ value: f, label: t(FILTER_LABEL[f], lang) }))} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} rowId="product_id" emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(r) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(r) },
            { label: t('stock_adjustment', lang), icon: ACTION_ICONS.edit, onClick: () => navigate('/inventory/adjustment', { state: { productId: r.product_id } }), hidden: !can('create_stock_adjustment') },
          ]} />} />
      </div>

      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="xl" title={detail?.row?.product_name}>
        {detail && (
          <div className="space-y-4 text-left">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-md bg-gray-50 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-400">{t('current_stock', lang)}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{formatNumberWithCommas(detail.row.current_stock)} {t(detail.row.unit, lang)}</p></div>
              <div className="rounded-md bg-gray-50 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-400">{t('category', lang)}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{detail.row.category_name || '—'}</p></div>
              <div className="rounded-md bg-gray-50 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-400">{t('alert_qty', lang)}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{formatNumberWithCommas(detail.row.minimum_stock)}</p></div>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('batch_number', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('current_stock', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('cost_price', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('selling_price', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('mfg_date', lang)}</th>{showExpiry && <th className="px-3 py-2.5 text-left font-medium">{t('exp_date', lang)}</th>}<th className="px-3 py-2.5 text-left font-medium">{t('status', lang)}</th><th className="w-16" /></tr></thead>
              <tbody>{detail.batches.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">{t('ui_nothing_yet', lang)}</td></tr>}{detail.batches.map((b) => <tr key={b.id} className="border-t border-gray-100"><td className="px-3 py-2.5">{b.batch_number || '—'}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(b.current_stock)}</td><td className="px-3 py-2.5 text-right">{formatCurrency(num(b.cost_price), settings)}</td><td className="px-3 py-2.5 text-right">{b.selling_price != null ? formatCurrency(num(b.selling_price), settings) : '—'}</td><td className="px-3 py-2.5">{dateOnly(b.manufacturing_date) || '—'}</td>{showExpiry && <td className="px-3 py-2.5">{dateOnly(b.expiry_date) || '—'}</td>}<td className="px-3 py-2.5">{t(b.status, lang)}</td><td className="px-2">{canEditBatch && <button type="button" className="text-primary text-xs hover:underline" onClick={() => setEdit({ id: b.id, batch_number: b.batch_number || '', cost_price: String(num(b.cost_price)), expiry_date: dateOnly(b.expiry_date) })}>{t('edit', lang)}</button>}</td></tr>)}</tbody></table></div>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <FormModal isOpen={!!edit} onClose={() => !saving && setEdit(null)} size="md" title={t('edit_batch', lang)}>
        {edit && <form onSubmit={(e) => { e.preventDefault(); saveBatch(); }} className="space-y-4"><Input label={t('batch_number', lang)} value={edit.batch_number} onChange={(e) => setEdit((x) => ({ ...x, batch_number: e.target.value }))} /><Input label={t('cost_price', lang)} value={edit.cost_price} onChange={(e) => setEdit((x) => ({ ...x, cost_price: e.target.value }))} />{showExpiry && <DatePicker label={t('exp_date', lang)} value={edit.expiry_date} onChange={(e) => setEdit((x) => ({ ...x, expiry_date: e.target.value }))} />}<div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t('ui_update', lang)}</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
    </MainLayout>
  );
}
