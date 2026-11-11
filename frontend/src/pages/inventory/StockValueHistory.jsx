// FILE PATH: frontend/src/pages/inventory/StockValueHistory.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { inventoryService, priceCategoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging, dateOnly } from '../sales/common';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const num = (v) => Number(v) || 0;
const fetchHistory = async ({ page, limit, search, priceCategoryId, startDate, endDate }) => {
  const r = await inventoryService.valueHistory({ page, limit, search: search || undefined, priceCategoryId: priceCategoryId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.data || [], pagination: toPaging(r.pagination, limit) };
};

export default function StockValueHistory() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const list = useServerList({ fetcher: fetchHistory, initialFilters: { search: '', priceCategoryId: '', startDate: '', endDate: '' } });
  useLiveRefresh(['stockValueSnapshot'], list.reload);
  const [cats, setCats] = useState([]);
  const [snap, setSnap] = useState(null);            // { priceCategoryId, notes }
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const money = (v) => formatCurrency(num(v), settings);
  useEffect(() => { priceCategoryService.getAll().then((r) => setCats(r.data)).catch(() => showError(t('failed_to_fetch_price_categories', lang))); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!snap.priceCategoryId) { showError(t('please_select_price_category', lang)); return; }
    try { setBusy(true); const r = await inventoryService.saveValueSnapshot({ priceCategoryId: snap.priceCategoryId, notes: snap.notes }); showSuccess(r.message || 'stock_value_snapshot_saved'); setSnap(null); list.reload(); }
    catch (err) { showError(err.message || t('failed_to_save_snapshot', lang)); } finally { setBusy(false); }
  };
  const open = async (h) => { try { setDetail((await inventoryService.valueHistoryDetail(h.id)).data); } catch (err) { showError(err.message); } };
  const remove = async () => { try { setBusy(true); const r = await inventoryService.deleteValueHistory(confirm.id); showSuccess(r.message || 'history_deleted_successfully'); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };

  const columns = [
    { key: 'snapshot_date', label: t('date', lang), render: (h) => <span className="font-medium text-gray-900">{dateOnly(h.snapshot_date)}</span> },
    { key: 'price_category_name', label: t('price_category', lang), render: (h) => h.price_category_name || '—' },
    { key: 'total_products', label: t('products', lang), align: 'right', render: (h) => formatNumberWithCommas(h.total_products) },
    { key: 'total_stock_worth', label: t('stock_worth', lang), align: 'right', render: (h) => money(h.total_stock_worth) },
    { key: 'total_potential_revenue', label: t('potential_revenue', lang), align: 'right', render: (h) => money(h.total_potential_revenue) },
    { key: 'total_potential_profit', label: t('potential_profit', lang), align: 'right', render: (h) => <span className={num(h.total_potential_profit) < 0 ? 'text-red-600' : 'text-green-700'}>{money(h.total_potential_profit)}</span> },
    { key: 'profit_margin', label: t('profit_margin', lang), align: 'right', render: (h) => `${num(h.profit_margin).toFixed(1)}%` },
  ];
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('stock_value_history', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('view_historical_stock_values', lang)}</p></div>
          {can('save_stock_value_history') && <Button onClick={() => setSnap({ priceCategoryId: cats.find((c) => c.is_default)?.id || cats[0]?.id || '', notes: '' })} mobileLabel={t('save_snapshot', lang)}>{t('save_snapshot', lang)}</Button>}
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} />
          <Select value={list.filters.priceCategoryId || ''} onChange={(e) => list.setFilter('priceCategoryId', e.target.value)} options={[{ value: '', label: t('all', lang) }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          <DatePicker value={list.filters.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} />
          <DatePicker align="right" value={list.filters.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} />
        </div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(h) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(h) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: h.id, name: dateOnly(h.snapshot_date) }), hidden: !can('delete_stock_value_history') },
          ]} />} />
      </div>

      <FormModal isOpen={!!snap} onClose={() => !busy && setSnap(null)} size="md" title={t('save_snapshot', lang)}>
        {snap && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4"><p className="text-sm text-gray-500 text-left">{t('snapshot_help', lang)}</p><Select label={t('price_category', lang)} required value={snap.priceCategoryId} onChange={(e) => setSnap((s) => ({ ...s, priceCategoryId: e.target.value }))} placeholder={t('select_price_category', lang)} options={cats.map((c) => ({ value: c.id, label: c.name }))} /><Textarea rows={2} label={t('notes', lang)} value={snap.notes} onChange={(e) => setSnap((s) => ({ ...s, notes: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setSnap(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('stock_value_history', lang)} · ${dateOnly(d?.snapshot_date)}`}>
        {d && (
          <div className="space-y-4 text-left">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['price_category', d.price_category_name], ['stock_worth', money(d.total_stock_worth)], ['potential_revenue', money(d.total_potential_revenue)], ['potential_profit', money(d.total_potential_profit)]].map(([k, v]) => <div key={k} className="rounded-md bg-gray-50 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{v || '—'}</p></div>)}</div>
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600"><p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>{d.notes || '—'}</div>
            <div className="overflow-x-auto border border-gray-200 rounded-md max-h-[50vh]"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500 sticky top-0"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('cost_price', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('selling_price', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('stock_worth', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('potential_profit', lang)}</th></tr></thead>
              <tbody>{(d.items || []).map((i, k) => <tr key={i.id || k} className="border-t border-gray-100"><td className="px-3 py-2.5">{i.product_name || i.name}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(i.quantity ?? i.current_stock)}</td><td className="px-3 py-2.5 text-right">{money(i.cost_price)}</td><td className="px-3 py-2.5 text-right">{money(i.selling_price)}</td><td className="px-3 py-2.5 text-right">{money(i.stock_worth)}</td><td className="px-3 py-2.5 text-right font-medium">{money(i.potential_profit)}</td></tr>)}</tbody></table></div>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
