// FILE PATH: frontend/src/pages/inventory/Products.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import ProductForm from './ProductForm';
import ProductDetails from './ProductDetails';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { productService, categoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { uploadImageToCloudinary } from '../../utils/cloudinary';
import { printBarcode } from '../../utils/barcodeUtils';
import { t } from '../../utils/i18n';

export default function Products() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const list = useServerList({ fetcher: productService.getAll });
  useLiveRefresh(['productAdded', 'productUpdated', 'productDeleted', 'productsBulkDeleted'], list.reload);

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ isOpen: false, product: null });
  const [details, setDetails] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });
  const [selected, setSelected] = useState([]);

  const canCreate = can('create_products');
  const canUpdate = can('update_products');
  const canDelete = can('delete_products');
  const canView = can('view_products');

  useEffect(() => {
    categoryService.getAll({ limit: 500 }).then((r) => setCategories(r.data)).catch(() => showError(t('failed_to_fetch_categories', lang)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id]);

  // A different page / search / store means a different set of rows: forget what was ticked.
  useEffect(() => { setSelected([]); }, [list.pagination.currentPage, list.filters.search, currentStore?.id]);

  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const stockText = (p) => `${settings.showUnit ? `${t(p.unit, lang)} ` : ''}${formatNumberWithCommas(p.current_stock)}`;

  // ── add / edit ──────────────────────────────────────────────────────────────────────────────────
  const save = async (v) => {
    const editing = !!form.product;
    try {
      setSaving(true);
      // A new picture goes to Cloudinary first; an unchanged one keeps its address.
      let image = typeof v.image === 'string' ? v.image : form.product?.image_url || null;
      let imagePublicId = form.product?.image_public_id ?? null;
      if (v.image && typeof v.image !== 'string' && v.image.file) {
        const up = await uploadImageToCloudinary(v.image);
        image = up.url; imagePublicId = up.public_id;
      } else if (!v.image) { image = null; imagePublicId = null; }

      const common = {
        product_name: v.product_name.trim(), unit: v.unit, product_category: v.product_category, product_description: v.product_description,
        alert_qty: Number(v.alert_qty) || 0, barcode: v.barcode || undefined, image: image || undefined, image_public_id: imagePublicId, storeId: currentStore.id,
      };
      const res = editing
        // The server's validator asks for the selling price on every save; an edit simply sends the one it already has.
        ? await productService.update(form.product.id, { ...common, status_: v.status, selling_price: Number(form.product.selling_price) || 0 })
        : await productService.create({ ...common, cost_price: Number(v.cost_price) || 0, selling_price: Number(v.selling_price) || 0, current_stock: Number(v.current_stock) || 0, mfg_date: v.mfg_date || undefined, exp_date: v.exp_date || undefined });
      showSuccess(res.message);
      setForm({ isOpen: false, product: null });
      list.reload();
    } catch (err) { showError(err.message || t('something_went_wrong', lang)); }   // the form stays open with what was typed
    finally { setSaving(false); }
  };

  // ── delete (one or many) ────────────────────────────────────────────────────────────────────────
  const remove = async () => {
    try {
      if (confirm.ids) {
        await productService.removeMany(confirm.ids);
        showSuccess(t('deleted_products', lang, { count: confirm.ids.length }));
        setSelected([]);
      } else {
        const res = await productService.remove(confirm.id);
        showSuccess(res.message);
      }
      list.reload();
    } catch (err) { showError(err.message); }
    setConfirm({ isOpen: false });
  };

  const printCode = (p) => {
    const code = p.barcode || '';
    if (!code) { showError(t('no_barcode_found', lang)); return; }
    printBarcode(code, p.name || '');
  };

  // ── table ───────────────────────────────────────────────────────────────────────────────────────
  const columns = [
    { key: 'name', label: t('product_name', lang), render: (p) => (
      <div className="flex items-center gap-3 min-w-0">
        {p.image_url ? <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded flex-shrink-0" /> : <span className="w-9 h-9 rounded bg-gray-100 flex-shrink-0" />}
        <span className="font-medium text-gray-900 truncate">{p.name}</span>
      </div>
    ) },
    { key: 'category_name', label: t('category', lang), render: (p) => p.category_name || t('not_specified', lang) },
    { key: 'barcode', label: t('barcode', lang), render: (p) => p.barcode || <span className="text-gray-400">—</span> },
    { key: 'status', label: t('status', lang), render: (p) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(p.status, lang)}</span> },
    { key: 'current_stock', label: t('current_stock', lang), align: 'right', render: (p) => {
      const low = Number(p.current_stock) <= Number(p.minimum_stock || 0);
      return <span className={low ? 'text-red-600 font-medium' : ''}>{stockText(p)}</span>;
    } },
    { key: 'selling_price', label: t('selling_price', lang), align: 'right', render: (p) => money(p.selling_price) },
  ];

  const toExportRows = (rows, offset = 0) => rows.map((p, i) => ({
    index: `${offset + i + 1}.`, name: p.name, category_name: p.category_name || t('not_specified', lang), barcode: p.barcode || '',
    product_stock: `${t(p.unit, lang)} ${formatNumberWithCommas(p.current_stock)}`, selling_price: formatNumberWithCommas(p.selling_price),
  }));
  const exportRows = useMemo(() => toExportRows(list.rows, (list.pagination.currentPage - 1) * list.pagination.limit), [list.rows, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportColumns = [
    { key: 'index', title: 'no.', width: '50px' }, { key: 'name', title: 'product_name' }, { key: 'category_name', title: 'category' },
    { key: 'barcode', title: 'barcode' }, { key: 'product_stock', title: 'current_stock' }, { key: 'selling_price', title: 'selling_price', halign: 'right' },
  ];
  // Export covers EVERY product that matches the search, not only the page on screen.
  const loadAllRows = async () => {
    const all = []; let page = 1; let totalPages = 1;
    do {
      const r = await productService.getAll({ search: list.filters.search, page, limit: 100 });
      all.push(...r.data); totalPages = r.pagination.totalPages; page += 1;
    } while (page <= totalPages && page <= 200);
    return toExportRows(all);
  };

  const allIds = list.rows.map((p) => p.id);
  const hasActions = canView || canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('products_management', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_store_products', lang)}</p>
          </div>
          <div className="flex items-center gap-3">
            {canDelete && selected.length > 0 && <Button variant="danger" mobileLabel={t('delete', lang)} onClick={() => setConfirm({ isOpen: true, ids: selected })}>{t('delete', lang)} ({selected.length})</Button>}
            {can('export_products_pdf') || can('view_products') ? <ExportMenu rows={exportRows} columns={exportColumns} title="products" loadRows={loadAllRows} disabled={list.loading || list.rows.length === 0} /> : null}
            {canCreate && <Button variant="primary" mobileLabel={t('new_product', lang)} onClick={() => setForm({ isOpen: true, product: null })}>{t('new_product', lang)}</Button>}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} />
        </div>

        <DataTable
          columns={columns} data={list.rows} loading={list.loading}
          emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)}
          pagination={list.pagination} onPageChange={list.setPage}
          selectable={canDelete} selectedIds={selected}
          onSelectAll={(e) => setSelected(e.target.checked ? allIds : [])}
          onSelectRow={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          renderActions={hasActions ? (p) => (
            <RowActions actions={[
              { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => setDetails(p), hidden: !canView },
              { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => setForm({ isOpen: true, product: p }), hidden: !canUpdate },
              { label: t('print_barcode', lang), icon: ACTION_ICONS.print, onClick: () => printCode(p), hidden: !p.barcode },
              { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, id: p.id, name: p.name }), hidden: !canDelete },
            ]} />
          ) : undefined}
        />
      </div>

      <ProductForm isOpen={form.isOpen} product={form.product} categories={categories} settings={settings} saving={saving} onClose={() => !saving && setForm({ isOpen: false, product: null })} onSubmit={save} />

      <ProductDetails
        isOpen={!!details} product={details} settings={settings} onClose={() => setDetails(null)} onPrintBarcode={details?.barcode ? printCode : undefined}
        onEdit={canUpdate ? (p) => { setDetails(null); setForm({ isOpen: true, product: p }); } : undefined}
        onDelete={canDelete ? (p) => { setDetails(null); setConfirm({ isOpen: true, id: p.id, name: p.name }); } : undefined}
      />

      <ConfirmModal
        isOpen={confirm.isOpen} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)}
        message={confirm.ids ? t('delete_selected_products_message', lang) : t('ui_confirm_delete', lang, { name: confirm.name })}
        onClose={() => setConfirm({ isOpen: false })} onConfirm={remove}
      />
    </MainLayout>
  );
}
