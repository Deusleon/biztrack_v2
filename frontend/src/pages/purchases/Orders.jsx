// FILE PATH: frontend/src/pages/purchases/Orders.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const STATUSES = ['draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled'];

export default function Orders() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const suppliers = useSuppliers();
  const list = useServerList({ fetcher: listFetcher(purchaseService.orders), initialFilters: INITIAL });
  useLiveRefresh(['purchaseOrderCreated', 'purchaseOrderUpdated', 'grnCreated'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);

  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);     // { kind: 'delete'|'reject', order }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const open = async (o) => { try { setDetail((await purchaseService.orders.get(o.id)).data); } catch (err) { showError(err.message); } };
  const run = async (fn, after) => { try { setBusy(true); const r = await fn(); showSuccess(r?.message); after?.(); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); setReason(''); } };
  const pdf = async (o) => { try { const { exportPurchaseOrderToPDF } = await import('../../utils/purchaseOrderPdf'); exportPurchaseOrderToPDF({ ...o, supplier_phone: o.supplier_phone || suppliers.find((s) => s.id === o.supplier_id)?.phone, supplier_email: o.supplier_email || o.supplier_email }, settings); } catch (err) { console.error(err); showError(t('something_went_wrong', lang)); } };

  const columns = [
    { key: 'po_number', label: t('po_number', lang), render: (o) => <span className="font-medium text-gray-900">#{o.po_number}</span> },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'order_date', label: t('date', lang), render: (o) => dateOnly(o.order_date) },
    { key: 'expected_delivery_date', label: t('expected_delivery', lang), render: (o) => dateOnly(o.expected_delivery_date) || '—' },
    { key: 'items_count', label: t('items', lang), align: 'right' },
    { key: 'total_amount', label: t('total', lang), align: 'right', render: (o) => money(o.total_amount) },
    { key: 'status', label: t('status', lang), render: (o) => <PStatus value={o.status} /> },
    { key: 'created_by_name', label: t('created_by', lang), render: (o) => o.created_by_name || '—' },
  ];
  const editable = (o) => can('update_purchase_orders') && ['draft', 'pending_approval'].includes(o.status);
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('purchase_orders', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_purchase_orders', lang)}</p></div>
          {can('create_purchase_orders') && <Button onClick={() => navigate('/purchases/orders/new')} mobileLabel={t('new_purchase_order', lang)}>{t('new_purchase_order', lang)}</Button>}
        </div>
        <PFilters list={list} statusOptions={STATUSES} suppliers={suppliers} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(o) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(o) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => navigate(`/purchases/orders/${o.id}/edit`), hidden: !editable(o) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ kind: 'delete', order: o }), hidden: !(can('delete_purchase_orders') && o.status === 'draft') },
          ]} />} />
      </div>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('purchase_order', lang)} #${d?.po_number || ''}`}>
        {d && (
          <div className="space-y-4">
            <Dl items={[[t('supplier', lang), d.supplier_name], [t('date', lang), dateOnly(d.order_date)], [t('expected_delivery', lang), dateOnly(d.expected_delivery_date)], [t('status', lang), <PStatus key="s" value={d.status} />], [t('payment_terms', lang), d.payment_terms], [t('delivery_address', lang), d.delivery_address], [t('created_by', lang), d.created_by_name], [t('approved_by', lang), d.approved_by_name]]} />
            <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('received', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('pending', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('unit_price', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('total', lang)}</th></tr></thead>
              <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2.5 text-left">{i.product_name}</td><td className="px-3 py-2.5 text-right">{num(i.quantity)}</td><td className="px-3 py-2.5 text-right">{num(i.received_quantity)}</td><td className="px-3 py-2.5 text-right">{num(i.pending_quantity)}</td><td className="px-3 py-2.5 text-right">{money(i.unit_price)}</td><td className="px-3 py-2.5 text-right font-medium">{money(i.line_total)}</td></tr>)}</tbody></table></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600"><p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>{[d.notes, d.internal_notes].filter(Boolean).join(' · ') || '—'}</div>
              <div className="rounded-md border border-gray-200 px-4 py-3 space-y-1.5 text-sm">{[['subtotal', d.subtotal], ['discount', d.discount_amount], ['tax', d.tax_amount], ['shipping_cost', d.shipping_cost]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-gray-500">{t(k, lang)}</span><span>{money(v)}</span></div>)}<div className="flex justify-between font-bold text-base border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(d.total_amount)}</span></div></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {can('approve_purchase_orders') && d.status === 'pending_approval' && <><Button loading={busy} onClick={() => run(() => purchaseService.orders.approve(d.id, 'approved'), () => setDetail(null))}>{t('approve', lang)}</Button><Button variant="danger" onClick={() => setConfirm({ kind: 'reject', order: d })}>{t('reject', lang)}</Button></>}
              {can('create_grn') && ['approved', 'partially_received'].includes(d.status) && <Button onClick={() => navigate('/purchases/goods-received', { state: { poId: d.id } })}>{t('receive_goods', lang)}</Button>}
              {editable(d) && <Button variant="secondary" onClick={() => navigate(`/purchases/orders/${d.id}/edit`)}>{t('edit', lang)}</Button>}
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
