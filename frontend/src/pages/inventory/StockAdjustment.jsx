// FILE PATH: frontend/src/pages/inventory/StockAdjustment.jsx
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { inventoryService, stockCountService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging, dateOnly, DetailGrid } from '../sales/common';
import { useAllProducts } from '../purchases/common';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const REASONS = ['damaged', 'expired', 'lost', 'found', 'correction', 'return', 'other'];
const num = (v) => Number(v) || 0;
const fetchAdj = async ({ page, limit, product_id, adjustment_type, reason, startDate, endDate }) => {
  const r = await inventoryService.adjustments({ page, limit, product_id: product_id || undefined, adjustment_type: adjustment_type || undefined, reason: reason || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.adjustments || [], pagination: toPaging(r.pagination, limit) };
};

export default function StockAdjustment() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const { state } = useLocation();
  const products = useAllProducts();
  const list = useServerList({ fetcher: fetchAdj, initialFilters: { product_id: '', adjustment_type: '', reason: '', startDate: '', endDate: '' } });
  useLiveRefresh(['stockAdjusted', 'stockUpdated'], list.reload);
  const [tab, setTab] = useState('history');     // history | by-product
  const [byProduct, setByProduct] = useState({ rows: [], loading: false });
  const [prodHist, setProdHist] = useState(null);
  const [form, setForm] = useState(null);             // { product_id, batch_id, adjustment_type, quantity, reason, notes }
  const [batches, setBatches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const batchWise = !!settings?.useBatchWisePrice;
  const product = products.find((p) => p.id === form?.product_id);

  const openNew = (productId = '') => setForm({ product_id: productId, batch_id: '', adjustment_type: 'add', quantity: '', reason: 'correction', notes: '' });
  useEffect(() => { if (state?.productId && can('create_stock_adjustment') && products.length) openNew(state.productId); }, [products.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!form?.product_id || !batchWise) { setBatches([]); return; }
    inventoryService.batchwiseStock({ search: product?.name, limit: 200 }).then((r) => setBatches((r.batches || []).filter((b) => b.product_id === form.product_id))).catch(() => setBatches([]));
  }, [form?.product_id, batchWise]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.product_id) { showError(t('select_product', lang)); return; }
    if (num(form.quantity) <= 0) { showError(t('quantity_must_be_positive', lang)); return; }
    try {
      setSaving(true);
      const body = { product_id: form.product_id, adjustment_type: form.adjustment_type, quantity: num(form.quantity), reason: form.reason, notes: form.notes };
      const r = form.batch_id ? await inventoryService.batchwiseAdjustment({ ...body, batch_id: form.batch_id }) : await inventoryService.createAdjustment(body);
      showSuccess(r.message || 'stock_adjusted'); setForm(null); list.reload();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  useEffect(() => {
    if (tab !== 'by-product') return;
    setByProduct((s) => ({ ...s, loading: true }));
    stockCountService.adjustmentsByProduct({ limit: 500 }).then((r) => setByProduct({ rows: r.products || [], loading: false })).catch((err) => { showError(err.message); setByProduct({ rows: [], loading: false }); });
  }, [tab, list.rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const openProduct = async (p) => { try { const r = await stockCountService.productAdjustments(p.product_id, { limit: 100 }); setProdHist({ product: r.product, rows: r.adjustments || [] }); } catch (err) { showError(err.message); } };
  const open = async (a) => { try { setDetail((await inventoryService.adjustmentDetail(a.id)).adjustment); } catch (err) { showError(err.message); } };

  const columns = [
    { key: 'created_at', label: t('date', lang), render: (a) => dateOnly(a.created_at) },
    { key: 'product_name', label: t('product_name', lang), render: (a) => <span className="font-medium text-gray-900">{a.product_name}</span> },
    { key: 'adjustment_type', label: t('type', lang), render: (a) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.adjustment_type === 'add' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{t(a.adjustment_type === 'add' ? 'stock_add' : 'stock_subtract', lang)}</span> },
    { key: 'quantity', label: t('quantity', lang), align: 'right', render: (a) => `${a.adjustment_type === 'add' ? '+' : '−'}${formatNumberWithCommas(a.quantity)} ${t(a.unit || a.product_unit, lang)}` },
    { key: 'reason', label: t('reason', lang), render: (a) => t(a.reason, lang) },
    { key: 'created_by_name', label: t('created_by', lang), render: (a) => a.created_by_name || '—' },
  ];
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('stock_adjustment', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_stock_adjustments', lang)}</p></div>
          {can('create_stock_adjustment') && <Button onClick={() => openNew()} mobileLabel={t('new_adjustment', lang)}>{t('new_adjustment', lang)}</Button>}
        </div>
        <div className="flex gap-2 border-b border-gray-200">{[['history', 'adjustment_history'], ['by-product', 'adjustments_by_product']].map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t(label, lang)}</button>)}</div>
        {tab === 'by-product' && (
          <DataTable columns={[
            { key: 'product_name', label: t('product_name', lang), render: (p) => <span className="font-medium text-gray-900">{p.product_name}</span> },
            { key: 'category_name', label: t('category', lang), render: (p) => p.category_name || '—' },
            { key: 'adjustment_count', label: t('adjustments', lang), align: 'right' },
            { key: 'total_added', label: t('stock_add', lang), align: 'right', render: (p) => <span className="text-green-700">+{formatNumberWithCommas(p.total_added)}</span> },
            { key: 'total_subtracted', label: t('stock_subtract', lang), align: 'right', render: (p) => <span className="text-red-600">−{formatNumberWithCommas(p.total_subtracted)}</span> },
            { key: 'last_adjustment', label: t('last_adjustment', lang), render: (p) => dateOnly(p.last_adjustment) || '—' },
          ]} data={byProduct.rows} loading={byProduct.loading} rowId="product_id" emptyMessage={t('ui_nothing_yet', lang)} renderActions={(p) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => openProduct(p) }]} />} />
        )}
        {tab === 'history' && (<>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select searchable value={list.filters.product_id || ''} onChange={(e) => list.setFilter('product_id', e.target.value)} options={[{ value: '', label: t('all_products', lang) }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
          <Select value={list.filters.adjustment_type || ''} onChange={(e) => list.setFilter('adjustment_type', e.target.value)} options={[{ value: '', label: t('all', lang) }, { value: 'add', label: t('stock_add', lang) }, { value: 'subtract', label: t('stock_subtract', lang) }]} />
          <Select value={list.filters.reason || ''} onChange={(e) => list.setFilter('reason', e.target.value)} options={[{ value: '', label: t('all_reasons', lang) }, ...REASONS.map((r) => ({ value: r, label: t(r, lang) }))]} />
          <DatePicker value={list.filters.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} />
          <DatePicker align="right" value={list.filters.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} />
        </div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(a) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(a) }]} />} />
        </>)}
      </div>
      <FormModal isOpen={!!prodHist} onClose={() => setProdHist(null)} size="xl" title={`${t('adjustment_history', lang)} · ${prodHist?.product?.name || ''}`}>
        {prodHist && <div className="space-y-4 text-left"><div className="overflow-x-auto border border-gray-200 rounded-md"><table className="table-cards w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('date', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('type', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('reason', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('created_by', lang)}</th></tr></thead>
          <tbody>{prodHist.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{t('ui_nothing_yet', lang)}</td></tr>}{prodHist.rows.map((a) => <tr key={a.id} className="border-t border-gray-100"><td className="px-3 py-2.5">{dateOnly(a.created_at)}</td><td className="px-3 py-2.5">{t(a.adjustment_type === 'add' ? 'stock_add' : 'stock_subtract', lang)}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(a.quantity)}</td><td className="px-3 py-2.5">{t(a.reason, lang)}</td><td className="px-3 py-2.5">{a.created_by_name || '—'}</td></tr>)}</tbody></table></div><div className="flex justify-end"><Button variant="secondary" onClick={() => setProdHist(null)}>{t('close', lang)}</Button></div></div>}
      </FormModal>

      <FormModal isOpen={!!form} onClose={() => !saving && setForm(null)} size="lg" title={t('new_adjustment', lang)}>
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <Select label={t('product_name', lang)} required searchable value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value, batch_id: '' }))} placeholder={t('select_product', lang)} options={products.map((p) => ({ value: p.id, label: p.name }))} />
            {product && <p className="text-xs text-gray-500 text-left">{t('current_stock', lang)}: <b>{formatNumberWithCommas(product.current_stock)} {t(product.unit, lang)}</b></p>}
            {batchWise && batches.length > 0 && <Select label={t('batch_number', lang)} value={form.batch_id} onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))} options={[{ value: '', label: t('latest_batch', lang) }, ...batches.map((b) => ({ value: b.batch_id, label: `${b.batch_number || '—'} (${formatNumberWithCommas(b.current_stock)})` }))]} />}
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('type', lang)} value={form.adjustment_type} onChange={(e) => setForm((f) => ({ ...f, adjustment_type: e.target.value }))} options={[{ value: 'add', label: t('stock_add', lang) }, { value: 'subtract', label: t('stock_subtract', lang) }]} />
              <Input label={t('quantity', lang)} required value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} inputMode="decimal" />
            </div>
            <Select label={t('reason', lang)} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} options={REASONS.map((r) => ({ value: r, label: t(r, lang) }))} />
            <Textarea rows={2} label={t('notes', lang)} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setForm(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>
      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={t('stock_adjustment', lang)}>
        {d && <div className="space-y-5 text-left">
          <DetailGrid items={[[t('product_name', lang), d.product_name], [t('type', lang), t(d.adjustment_type === 'add' ? 'stock_add' : 'stock_subtract', lang)], [t('quantity', lang), `${formatNumberWithCommas(d.quantity)} ${t(d.product_unit, lang)}`], [t('reason', lang), t(d.reason, lang)], [t('created_by', lang), d.created_by_name], [t('date', lang), dateOnly(d.created_at)]]} />
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600"><p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>{d.notes || '—'}</div>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div>
        </div>}
      </FormModal>
    </MainLayout>
  );
}
