// FILE PATH: frontend/src/pages/inventory/PriceList.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { inventoryService, priceCategoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import { DataTable, Button, RowActions, ACTION_ICONS, Input, Select } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging } from '../sales/common';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const num = (v) => Number(v) || 0;

/** Selling (and buying) price of every product, per price category — one row per batch when the store prices by batch. */
export default function PriceList() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  useEffect(() => { priceCategoryService.getAll().then((r) => { setCats(r.data); setCat((c) => c || r.data.find((x) => x.is_default)?.id || r.data[0]?.id || ''); }).catch(() => showError(t('failed_to_fetch_price_categories', lang))); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetcher = async ({ page, limit, search }) => {
    if (!cat) return { data: [], pagination: toPaging({}, limit) };
    const r = await inventoryService.priceList({ priceCategoryId: cat, page, limit, search: search || '', expandBatches: !!settings?.useBatchWisePrice });
    return { data: r.products || [], pagination: toPaging(r.pagination, limit) };
  };
  const list = useServerList({ fetcher, initialFilters: { search: '' }, enabled: !!cat });
  useEffect(() => { if (cat) list.reload(); }, [cat, settings?.useBatchWisePrice]); // eslint-disable-line react-hooks/exhaustive-deps
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const money = (v) => formatCurrency(num(v), settings);
  const canManage = can('manage_price_list');
  const catName = cats.find((c) => c.id === cat)?.name;

  const save = async () => {
    if (num(edit.sellingPrice) < 0 || edit.sellingPrice === '') { showError(t('enter_selling_price', lang)); return; }
    try { setSaving(true); const r = await inventoryService.updatePrices({ productId: edit.row.productId, batchId: edit.row.batchId, priceCategoryId: cat, sellingPrice: num(edit.sellingPrice), buyingPrice: edit.buyingPrice === '' ? undefined : num(edit.buyingPrice) }); showSuccess(r.message || 'prices_updated'); setEdit(null); list.reload(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'productName', label: t('product_name', lang), render: (r) => <span className="font-medium text-gray-900">{r.productName}</span> },
    { key: 'categoryName', label: t('category', lang), render: (r) => r.categoryName || '—' },
    ...(settings?.useBatchWisePrice ? [{ key: 'batchNumber', label: t('batch_number', lang), render: (r) => r.batchNumber || '—' }] : []),
    { key: 'availableStock', label: t('current_stock', lang), align: 'right', render: (r) => `${formatNumberWithCommas(r.availableStock)} ${t(r.unit, lang)}` },
    { key: 'buyingPrice', label: t('cost_price', lang), align: 'right', render: (r) => money(r.buyingPrice) },
    { key: 'sellingPrice', label: t('selling_price', lang), align: 'right', render: (r) => <span className="font-medium">{money(r.sellingPrice)}</span> },
    { key: 'profit', label: t('profit', lang), align: 'right', render: (r) => <span className={num(r.profit) < 0 ? 'text-red-600' : 'text-green-700'}>{money(r.profit)} ({num(r.profitPercent).toFixed(1)}%)</span> },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'productName', title: 'product_name' }, { key: 'availableStock', title: 'current_stock' }, { key: 'buyingPrice', title: 'cost_price' }, { key: 'sellingPrice', title: 'selling_price' }, { key: 'profit', title: 'profit' }];
  const exportRows = useMemo(() => list.rows.map((r, i) => ({ index: `${(list.pagination.currentPage - 1) * list.pagination.limit + i + 1}.`, productName: r.productName, availableStock: formatNumberWithCommas(r.availableStock), buyingPrice: money(r.buyingPrice), sellingPrice: money(r.sellingPrice), profit: money(r.profit) })), [list.rows, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('price_list', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('product_prices_desc', lang)}</p></div>
          <ExportMenu rows={exportRows} columns={exportCols} title="price_list" disabled={list.loading || list.rows.length === 0} />
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Select label={t('price_category', lang)} value={cat} onChange={(e) => setCat(e.target.value)} placeholder={t('select_price_category', lang)} options={cats.map((c) => ({ value: c.id, label: c.name }))} /><Input label={t('search', lang)} value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} rowId="id" emptyMessage={t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={canManage ? (r) => <RowActions actions={[{ label: t('update_price', lang), icon: ACTION_ICONS.edit, onClick: () => setEdit({ row: r, sellingPrice: String(num(r.sellingPrice)), buyingPrice: String(num(r.buyingPrice)) }) }]} /> : undefined} />
      </div>
      <FormModal isOpen={!!edit} onClose={() => !saving && setEdit(null)} size="sm" title={t('update_price', lang)}>
        {edit && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4"><p className="text-sm text-gray-600 text-left">{edit.row.productName}{edit.row.batchNumber ? ` · ${edit.row.batchNumber}` : ''} · {catName}</p><Input label={t('selling_price', lang)} required autoFocus value={edit.sellingPrice} onChange={(e) => setEdit((x) => ({ ...x, sellingPrice: e.target.value }))} /><Input label={t('cost_price', lang)} value={edit.buyingPrice} onChange={(e) => setEdit((x) => ({ ...x, buyingPrice: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t('ui_update', lang)}</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
    </MainLayout>
  );
}
