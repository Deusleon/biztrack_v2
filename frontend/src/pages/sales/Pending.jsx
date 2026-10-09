// FILE PATH: frontend/src/pages/sales/Pending.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { salesService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, FormModal, Button, RowActions, ACTION_ICONS, Textarea } from '../../components/ui';
import { FilterBar, StatusBadge, dateOnly } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

// The server returns every pending order at once; search, status and paging are done here.
const fetchOrders = async ({ search = '', status = '', page = 1, limit = 25 }) => {
  // 'pending' = waiting orders, 'cancelled' = cancelled ones, empty = both
  const lists = await Promise.all([status !== 'cancelled' ? salesService.getPendingOrders() : null, status !== 'pending' ? salesService.getPendingOrders('Cancelled') : null]);
  const q = search.trim().toLowerCase();
  const all = lists.flatMap((r) => r?.orderDatas || []).filter((o) => !q || `${o.order_number} ${o.customer_name} ${o.customer_phone}`.toLowerCase().includes(q));
  const totalPages = Math.max(1, Math.ceil(all.length / limit));
  return { data: all.slice((page - 1) * limit, page * limit), pagination: { currentPage: Math.min(page, totalPages), totalPages, totalItems: all.length, limit } };
};

export default function Pending() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const list = useServerList({ fetcher: fetchOrders, initialFilters: { search: '', status: '' } });
  useLiveRefresh(['orderCreated', 'orderUpdated', 'newSale'], list.reload);
  const [confirm, setConfirm] = useState({ isOpen: false });
  const [cancel, setCancel] = useState(null);
  const [reason, setReason] = useState('');
  const manage = can('manage_pending_invoices') || can('create_invoice');
  const money = (v) => formatCurrency(Number(v) || 0, settings);

  const remove = async () => {
    try {
      if (confirm.mode === 'cancel') { await salesService.cancelOrder(confirm.code); showSuccess('order_cancelled'); }
      else { await salesService.deleteOrder(confirm.code); showSuccess('order_deleted'); }
      list.reload();
    } catch (err) { showError(err.message); }
    setConfirm({ isOpen: false });
  };
  const cancelPaid = async () => {
    if (reason.trim().length < 3) { showError(t('cancel_reason_required', lang)); return; }
    try { await salesService.cancelOrder(cancel.cart_code, reason.trim()); showSuccess('order_cancelled'); setCancel(null); setReason(''); list.reload(); }
    catch (err) { showError(err.message); }
  };
  const open = (o, path = '/sales/pending/preview') => navigate(path, { state: { cartCode: o.cart_code, fromPendingOrder: true } });

  const columns = [
    { key: 'order_number', label: t('order_number', lang), render: (o) => <span className="font-medium text-gray-900">#{o.order_number}</span> },
    { key: 'customer_name', label: t('customer', lang), render: (o) => o.customer_name || t('walk_in', lang) },
    { key: 'customer_phone', label: t('phone', lang), render: (o) => o.customer_phone || '—' },
    { key: 'order_value', label: t('total', lang), align: 'right', render: (o) => money(o.order_value) },
    { key: 'amount_paid', label: t('amount_paid', lang), align: 'right', render: (o) => money(o.amount_paid) },
    { key: 'order_status', label: t('status', lang), render: (o) => <StatusBadge value={o.order_status} /> },
    { key: 'created_at', label: t('date', lang), render: (o) => dateOnly(o.created_at) },
  ];

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('pending_orders', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_pending_orders', lang)}</p></div>
          {can('create_invoice') && <Button onClick={() => navigate('/sales/invoice')}>{t('new_sale', lang)}</Button>}
        </div>
        <FilterBar list={list} statusKey="status" statusOptions={['pending', 'cancelled']} dates={false} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} rowId="cart_code" emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(o) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(o) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => open(o, '/sales/invoice'), hidden: !manage },
            { label: t('cancel_order', lang), icon: ACTION_ICONS.remove, onClick: () => { if (o.has_payment) { setReason(''); setCancel(o); } else setConfirm({ isOpen: true, mode: 'cancel', code: o.cart_code, name: `#${o.order_number}` }); }, hidden: !manage || String(o.order_status || '').toLowerCase().includes('cancel') },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, mode: 'delete', code: o.cart_code, name: `#${o.order_number}` }), hidden: !can('manage_pending_invoices') || o.has_payment },
          ]} />} />
      </div>
      <ConfirmModal isOpen={confirm.isOpen} variant={confirm.mode === 'cancel' ? 'warning' : 'danger'} title={t(confirm.mode === 'cancel' ? 'cancel_order' : 'delete', lang)} confirmText={t(confirm.mode === 'cancel' ? 'confirm' : 'delete', lang)} cancelText={t('ui_cancel', lang)} message={confirm.mode === 'cancel' ? t('confirm_cancel_order', lang) : t('ui_confirm_delete', lang, { name: confirm.name })} onClose={() => setConfirm({ isOpen: false })} onConfirm={remove} />
      <FormModal isOpen={!!cancel} title={t('cancel_order', lang)} onClose={() => setCancel(null)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('cancel_reason_required', lang)}</p>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('cancel_reason_placeholder', lang)} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancel(null)}>{t('ui_cancel', lang)}</Button><Button variant="danger" onClick={cancelPaid}>{t('cancel_order', lang)}</Button></div>
        </div>
      </FormModal>
    </MainLayout>
  );
}
