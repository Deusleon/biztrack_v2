// FILE PATH: frontend/src/pages/inventory/StockValue.jsx
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
import { DataTable, Input, Select } from '../../components/ui';
import { toPaging } from '../sales/common';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const num = (v) => Number(v) || 0;

/** What the stock on the shelves is worth at cost and at selling price, for one price category. */
export default function StockValue() {
  const { can } = useAuth();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  useEffect(() => { priceCategoryService.getAll().then((r) => { setCats(r.data); setCat((c) => c || r.data.find((x) => x.is_default)?.id || r.data[0]?.id || ''); }).catch(() => showError(t('failed_to_fetch_price_categories', lang))); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetcher = async ({ page, limit, search }) => {
    if (!cat) return { data: [], pagination: toPaging({}, limit) };
    const r = await inventoryService.stockValue(cat, { page, limit, search: search || undefined });
    return { data: r.stockValue || [], pagination: toPaging(r.pagination, limit), summary: r.totals };
  };
  const list = useServerList({ fetcher, initialFilters: { search: '' }, enabled: !!cat });
  useEffect(() => { if (cat) list.reload(); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = (v) => formatCurrency(num(v), settings);
  const tot = list.summary || {};
  const name = (r) => r.product_name || r.name;

  const columns = [
    { key: 'name', label: t('product_name', lang), render: (r) => <span className="font-medium text-gray-900">{name(r)}</span> },
    { key: 'category_name', label: t('category', lang), render: (r) => r.category_name || '—' },
    { key: 'current_stock', label: t('current_stock', lang), align: 'right', render: (r) => `${formatNumberWithCommas(r.current_stock)} ${t(r.unit, lang)}` },
    { key: 'cost_price', label: t('cost_price', lang), align: 'right', render: (r) => money(r.cost_price) },
    { key: 'selling_price', label: t('selling_price', lang), align: 'right', render: (r) => money(r.selling_price) },
    { key: 'stock_worth', label: t('stock_worth', lang), align: 'right', render: (r) => money(r.stock_worth) },
    { key: 'potential_revenue', label: t('potential_revenue', lang), align: 'right', render: (r) => money(r.potential_revenue) },
    { key: 'potential_profit', label: t('potential_profit', lang), align: 'right', render: (r) => <span className={num(r.potential_profit) < 0 ? 'text-red-600' : 'text-green-700'}>{money(r.potential_profit)}</span> },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'name', title: 'product_name' }, { key: 'current_stock', title: 'current_stock' }, { key: 'cost_price', title: 'cost_price' }, { key: 'selling_price', title: 'selling_price' }, { key: 'stock_worth', title: 'stock_worth' }, { key: 'potential_profit', title: 'potential_profit' }];
  const exportRows = useMemo(() => list.rows.map((r, i) => ({ index: `${(list.pagination.currentPage - 1) * list.pagination.limit + i + 1}.`, name: name(r), current_stock: formatNumberWithCommas(r.current_stock), cost_price: money(r.cost_price), selling_price: money(r.selling_price), stock_worth: money(r.stock_worth), potential_profit: money(r.potential_profit) })), [list.rows, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const margin = num(tot.totalRevenue) ? (num(tot.totalProfit) / num(tot.totalRevenue)) * 100 : 0;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('current_stock_value', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('view_stock_value_and_profit', lang)}</p></div>
          {(can('export_inventory_pdf') || can('view_current_stock_value')) && <ExportMenu rows={exportRows} columns={exportCols} title="current_stock_value" orientation="landscape" disabled={list.loading || list.rows.length === 0} />}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['total_cost_value', money(tot.totalWorth)], ['total_selling_value', money(tot.totalRevenue)], [num(tot.totalProfit) < 0 ? 'total_potential_loss' : 'total_potential_profit', money(Math.abs(num(tot.totalProfit)))], ['profit_margin', `${margin.toFixed(1)}%`]].map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1">{v}</p></div>)}
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Select label={t('price_category', lang)} value={cat} onChange={(e) => setCat(e.target.value)} options={cats.map((c) => ({ value: c.id, label: c.name }))} /><Input label={t('search', lang)} value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} rowId="product_id" emptyMessage={t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage} />
      </div>
    </MainLayout>
  );
}
