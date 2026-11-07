// FILE PATH: frontend/src/pages/purchases/Orders.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, Select, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, useAllProducts, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { exportPurchaseOrderToPDF } from '../../utils/purchaseOrderPdf';
import { t } from '../../utils/i18n';

const EMPTY = { supplier_id: '', expected_delivery_date: '', delivery_address: '', payment_terms: '', notes: '', internal_notes: '', items: [] };
const blankItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', quantity: '1', unit_price: '', discount_percent: '0', tax_rate: '0', notes: '' });
const lineOf = (i) => { const gross = num(i.quantity) * num(i.unit_price); const net = gross - (gross * num(i.discount_percent)) / 100; return { net, tax: (net * num(i.tax_rate)) / 100, total: net + (net * num(i.tax_rate)) / 100 }; };
const STATUSES = ['draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled'];

export default function Orders() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const suppliers = useSuppliers(); const products = useAllProducts();
  const list = useServerList({ fetcher: listFetcher(purchaseService.orders), initialFilters: INITIAL });
  useLiveRefresh(['purchaseOrderCreated', 'purchaseOrderUpdated', 'grnCreated'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);

  const [editor, setEditor] = useState(null);       // { mode, id, ...form }
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);     // { kind: 'delete'|'reject', order }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const cartCode = useRef(null); const syncTimer = useRef(null);

  const totals = useMemo(() => (editor?.items || []).reduce((a, i) => { const l = lineOf(i); return { net: a.net + l.net, tax: a.tax + l.tax, total: a.total + l.total }; }, { net: 0, tax: 0, total: 0 }), [editor?.items]);
  const setE = (patch) => setEditor((e) => ({ ...e, ...patch }));
  const setItem = (key, patch) => setE({ items: editor.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  // A NEW order is kept as a draft on the server (same as the original): it survives a refresh or another device.
  const openCreate = async () => {
    let base = { ...EMPTY, items: [blankItem()] };
    try {
      const c = await purchaseService.orders.activeCart();
      if (c.cart_code) cartCode.current = c.cart_code;
      if (c.form_data || (c.items || []).length) base = { ...EMPTY, ...(c.form_data || {}), supplier_id: c.form_data?.supplier_id || '', items: (c.items || []).length ? c.items.map((i) => ({ key: Math.random().toString(36).slice(2), product_id: i.product_id, quantity: String(num(i.quantity)), unit_price: String(num(i.unit_price)), discount_percent: String(num(i.discount_percent)), tax_rate: String(num(i.tax_rate)), notes: i.notes || '' })) : [blankItem()] };
    } catch { /* no draft */ }
    setEditor({ mode: 'create', ...base });
  };
  const openEdit = (o) => setEditor({ mode: 'edit', id: o.id, supplier_id: o.supplier_id, expected_delivery_date: dateOnly(o.expected_delivery_date), delivery_address: o.delivery_address || '', payment_terms: o.payment_terms || '', notes: o.notes || '', internal_notes: o.internal_notes || '',
    items: (o.items || []).map((i) => ({ key: i.id, product_id: i.product_id, quantity: String(num(i.quantity)), unit_price: String(num(i.unit_price)), discount_percent: String(num(i.discount_percent)), tax_rate: String(num(i.tax_rate)), notes: i.notes || '' })) });

  const payloadItems = (items) => items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, quantity: num(i.quantity), unit_price: num(i.unit_price), discount_percent: num(i.discount_percent), tax_rate: num(i.tax_rate), notes: i.notes || '' }));
  useEffect(() => {
    if (!editor || editor.mode !== 'create') return undefined;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { purchaseService.orders.syncCart({ cart_code: cartCode.current, supplier_id: editor.supplier_id || null, expected_delivery_date: editor.expected_delivery_date || null, delivery_address: editor.delivery_address, payment_terms: editor.payment_terms, notes: editor.notes, internal_notes: editor.internal_notes, items: payloadItems(editor.items) }).then((r) => { if (r.cart_code) cartCode.current = r.cart_code; }).catch(() => {}); }, 900);
    return () => clearTimeout(syncTimer.current);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeEditor = () => setEditor(null);
  const save = async () => {
    const items = payloadItems(editor.items);
    if (!editor.supplier_id) { showError(t('select_supplier', lang)); return; }
    if (items.length === 0) { showError(t('add_at_least_one_item', lang)); return; }
    if (items.some((i) => i.quantity <= 0 || i.unit_price < 0)) { showError(t('quantity_must_be_positive', lang)); return; }
    try {
      setSaving(true);
      const body = { supplier_id: editor.supplier_id, expected_delivery_date: editor.expected_delivery_date || undefined, delivery_address: editor.delivery_address, payment_terms: editor.payment_terms, notes: editor.notes, internal_notes: editor.internal_notes, items };
      const res = editor.mode === 'edit' ? await purchaseService.orders.update(editor.id, body) : await purchaseService.orders.create(body);
      if (editor.mode === 'create') { clearTimeout(syncTimer.current); await purchaseService.orders.syncCart({ cart_code: cartCode.current, items: [] }).catch(() => {}); cartCode.current = null; }
      showSuccess(res.message); setEditor(null); setDetail(null); list.reload();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const open = async (o) => { try { setDetail((await purchaseService.orders.get(o.id)).data); } catch (err) { showError(err.message); } };
  const run = async (fn, after) => { try { setBusy(true); const r = await fn(); showSuccess(r?.message); after?.(); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); setReason(''); } };
  const pdf = (o) => { try { exportPurchaseOrderToPDF({ ...o, supplier_phone: o.supplier_phone || suppliers.find((s) => s.id === o.supplier_id)?.phone, supplier_email: o.supplier_email || o.supplier_email }, settings); } catch (err) { console.error(err); showError(t('something_went_wrong', lang)); } };

  const columns = [
    { key: 'po_number', label: t('po_number', lang), render: (o) => <span className="font-medium text-gray-900">#{o.po_number}</span> },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'order_date', label: t('date', lang), render: (o) => dateOnly(o.order_date) },
    { key: 'expected_delivery_date', label: t('expected_delivery', lang), render: (o) => dateOnly(o.expected_delivery_date) || '—' },
    { key: 'items_count', label: t('items', lang), align: 'right' },
    { key: 'total_amount', label: t('total', lang), align: 'right', render: (o) => money(o.total_amount) },
    { key: 'status', label: t('status', lang), render: (o) => <PStatus value={o.status} /> },
  ];
  const editable = (o) => can('update_purchase_orders') && ['draft', 'pending_approval'].includes(o.status);
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('purchase_orders', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_purchase_orders', lang)}</p></div>
          {can('create_purchase_orders') && <Button onClick={openCreate} mobileLabel={t('new_purchase_order', lang)}>{t('new_purchase_order', lang)}</Button>}
        </div>
        <PFilters list={list} statusOptions={STATUSES} suppliers={suppliers} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(o) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(o) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: async () => openEdit((await purchaseService.orders.get(o.id)).data), hidden: !editable(o) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ kind: 'delete', order: o }), hidden: !(can('delete_purchase_orders') && o.status === 'draft') },
          ]} />} />
      </div>

      <FormModal isOpen={!!editor} onClose={() => !saving && closeEditor()} size="xl" title={editor?.mode === 'edit' ? t('update_purchase_order', lang) : t('new_purchase_order', lang)}>
        {editor && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select label={t('supplier', lang)} required searchable value={editor.supplier_id} onChange={(e) => setE({ supplier_id: e.target.value, payment_terms: editor.payment_terms || suppliers.find((s) => s.id === e.target.value)?.payment_terms || '' })} placeholder={t('select_supplier', lang)} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <Input type="date" label={t('expected_delivery', lang)} value={editor.expected_delivery_date} onChange={(e) => setE({ expected_delivery_date: e.target.value })} />
              <Input label={t('payment_terms', lang)} value={editor.payment_terms} onChange={(e) => setE({ payment_terms: e.target.value })} />
            </div>
            <Input label={t('delivery_address', lang)} value={editor.delivery_address} onChange={(e) => setE({ delivery_address: e.target.value })} />
            <div className="overflow-x-auto border border-gray-100 rounded">
              <table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-2 py-2 text-left min-w-[14rem]">{t('product_name', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('quantity', lang)}</th><th className="px-2 py-2 w-32 text-right">{t('unit_price', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('discount', lang)} %</th><th className="px-2 py-2 w-24 text-right">{t('tax', lang)} %</th><th className="px-2 py-2 w-32 text-right">{t('total', lang)}</th><th className="w-8" /></tr></thead>
                <tbody>{editor.items.map((i) => (
                  <tr key={i.key} className="border-t border-gray-100">
                    <td className="px-2 py-1.5"><Select searchable value={i.product_id} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setItem(i.key, { product_id: e.target.value, unit_price: i.unit_price || String(num(p?.cost_price)) }); }} placeholder={t('select_product', lang)} options={products.map((p) => ({ value: p.id, label: p.name }))} /></td>
                    {['quantity', 'unit_price', 'discount_percent', 'tax_rate'].map((f) => <td key={f} className="px-2 py-1.5"><input className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded" inputMode="decimal" value={i[f]} onChange={(e) => setItem(i.key, { [f]: e.target.value })} /></td>)}
                    <td className="px-2 py-1.5 text-right font-medium">{money(lineOf(i).total)}</td>
                    <td className="px-1"><button type="button" className="text-gray-400 hover:text-red-600" onClick={() => setE({ items: editor.items.length > 1 ? editor.items.filter((x) => x.key !== i.key) : [blankItem()] })} aria-label={t('delete', lang)}>✕</button></td>
                  </tr>))}</tbody></table>
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <Button type="button" variant="secondary" onClick={() => setE({ items: [...editor.items, blankItem()] })}>{t('add_item', lang)}</Button>
              <div className="text-sm space-y-1 min-w-[14rem]"><div className="flex justify-between"><span className="text-gray-500">{t('subtotal', lang)}</span><span>{money(totals.net)}</span></div><div className="flex justify-between"><span className="text-gray-500">{t('tax', lang)}</span><span>{money(totals.tax)}</span></div><div className="flex justify-between font-bold border-t border-gray-100 pt-1"><span>{t('total', lang)}</span><span>{money(totals.total)}</span></div></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Textarea rows={2} label={t('notes', lang)} value={editor.notes} onChange={(e) => setE({ notes: e.target.value })} /><Textarea rows={2} label={t('internal_notes', lang)} value={editor.internal_notes} onChange={(e) => setE({ internal_notes: e.target.value })} /></div>
            <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{editor.mode === 'edit' ? t('ui_update', lang) : t('save', lang)}</Button><Button type="button" variant="secondary" onClick={closeEditor}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('purchase_order', lang)} #${d?.po_number || ''}`}>
        {d && (
          <div className="space-y-4">
            <Dl items={[[t('supplier', lang), d.supplier_name], [t('date', lang), dateOnly(d.order_date)], [t('expected_delivery', lang), dateOnly(d.expected_delivery_date)], [t('status', lang), <PStatus key="s" value={d.status} />], [t('payment_terms', lang), d.payment_terms], [t('delivery_address', lang), d.delivery_address], [t('created_by', lang), d.created_by_name], [t('approved_by', lang), d.approved_by_name]]} />
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-3 py-2 text-right">{t('quantity', lang)}</th><th className="px-3 py-2 text-right">{t('received', lang)}</th><th className="px-3 py-2 text-right">{t('pending', lang)}</th><th className="px-3 py-2 text-right">{t('unit_price', lang)}</th><th className="px-3 py-2 text-right">{t('total', lang)}</th></tr></thead>
              <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{i.product_name}</td><td className="px-3 py-2 text-right">{num(i.quantity)}</td><td className="px-3 py-2 text-right">{num(i.received_quantity)}</td><td className="px-3 py-2 text-right">{num(i.pending_quantity)}</td><td className="px-3 py-2 text-right">{money(i.unit_price)}</td><td className="px-3 py-2 text-right font-medium">{money(i.line_total)}</td></tr>)}</tbody></table></div>
            <div className="ml-auto max-w-xs text-sm space-y-1">{[['subtotal', d.subtotal], ['discount', d.discount_amount], ['tax', d.tax_amount], ['shipping_cost', d.shipping_cost], ['total', d.total_amount]].map(([k, v]) => <div key={k} className={`flex justify-between ${k === 'total' ? 'font-bold border-t border-gray-100 pt-1' : ''}`}><span className="text-gray-500">{t(k, lang)}</span><span>{money(v)}</span></div>)}</div>
            {(d.notes || d.internal_notes) && <p className="text-sm text-gray-600 text-left">{[d.notes, d.internal_notes].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {can('approve_purchase_orders') && d.status === 'pending_approval' && <><Button loading={busy} onClick={() => run(() => purchaseService.orders.approve(d.id, 'approved'), () => setDetail(null))}>{t('approve', lang)}</Button><Button variant="danger" onClick={() => setConfirm({ kind: 'reject', order: d })}>{t('reject', lang)}</Button></>}
              {can('create_grn') && ['approved', 'partially_received'].includes(d.status) && <Button onClick={() => navigate('/purchases/goods-received', { state: { poId: d.id } })}>{t('receive_goods', lang)}</Button>}
              {editable(d) && <Button variant="secondary" onClick={() => { const o = d; setDetail(null); openEdit(o); }}>{t('edit', lang)}</Button>}
              <Button variant="secondary" onClick={() => pdf(d)}>PDF</Button>
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={confirm?.kind === 'reject'} onClose={() => setConfirm(null)} size="sm" title={t('reject', lang)}>
        <div className="space-y-3"><Textarea rows={3} label={t('reason', lang)} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-3"><Button variant="danger" loading={busy} onClick={() => run(() => purchaseService.orders.approve(confirm.order.id, 'cancelled', reason), () => setDetail(null))}>{t('reject', lang)}</Button><Button variant="secondary" onClick={() => setConfirm(null)}>{t('ui_cancel', lang)}</Button></div></div>
      </FormModal>
      <ConfirmModal isOpen={confirm?.kind === 'delete'} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: `#${confirm?.order?.po_number || ''}` })} onClose={() => setConfirm(null)} onConfirm={() => run(() => purchaseService.orders.remove(confirm.order.id))} />
    </MainLayout>
  );
}
