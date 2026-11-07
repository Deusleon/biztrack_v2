// FILE PATH: frontend/src/pages/purchases/Payments.jsx
import { useState, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import PaymentModal from './PaymentModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

export default function Payments() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const suppliers = useSuppliers();
  const list = useServerList({ fetcher: listFetcher(purchaseService.payments, ['payment_method']), initialFilters: { ...INITIAL, payment_method: '' } });
  useLiveRefresh(['supplierPaymentCreated', 'supplierInvoiceCreated'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);
  const [open, setOpen] = useState(false);
  const [outstanding, setOutstanding] = useState([]);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const openNew = async () => {
    try { const r = await Promise.all(['unpaid', 'partial'].map((s) => purchaseService.invoices.list({ payment_status: s, limit: 100 }))); setOutstanding(r.flatMap((x) => x.data).filter((i) => num(i.balance_due) > 0 && i.status !== 'cancelled')); } catch { setOutstanding([]); }
    setOpen(true);
  };
  const remove = async () => { try { setBusy(true); const r = await purchaseService.payments.remove(confirm.id); showSuccess(r.message); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };

  const columns = [
    { key: 'payment_number', label: t('payment_number', lang), render: (p) => <span className="font-medium text-gray-900">#{p.payment_number}</span> },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'bill_number', label: t('invoice', lang), render: (p) => (p.bill_number ? `#${p.bill_number}` : '—') },
    { key: 'payment_date', label: t('payment_date', lang), render: (p) => dateOnly(p.payment_date) },
    { key: 'payment_method', label: t('payment_method', lang), render: (p) => t(p.payment_method, lang) },
    { key: 'amount', label: t('amount', lang), align: 'right', render: (p) => money(p.amount) },
    { key: 'status', label: t('status', lang), render: (p) => <PStatus value={p.status} /> },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'payment_number', title: 'payment_number' }, { key: 'supplier_name', title: 'supplier' }, { key: 'bill_number', title: 'invoice' }, { key: 'payment_date', title: 'payment_date' }, { key: 'payment_method', title: 'payment_method' }, { key: 'amount', title: 'amount' }];
  const exportRows = useMemo(() => list.rows.map((p, k) => ({ index: `${(list.pagination.currentPage - 1) * list.pagination.limit + k + 1}.`, payment_number: p.payment_number, supplier_name: p.supplier_name, bill_number: p.bill_number || '', payment_date: dateOnly(p.payment_date), payment_method: t(p.payment_method, lang), amount: money(p.amount) })), [list.rows, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('supplier_payments', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_supplier_payments', lang)}</p></div>
          <div className="flex items-center gap-3"><ExportMenu rows={exportRows} columns={exportCols} title="supplier_payments" disabled={list.loading || list.rows.length === 0} />{can('create_supplier_payments') && <Button onClick={openNew} mobileLabel={t('new_payment', lang)}>{t('new_payment', lang)}</Button>}</div>
        </div>
        <PFilters list={list} statusOptions={['completed', 'cancelled']} suppliers={suppliers} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(p) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => setDetail(p) },
            { label: t('cancel_payment', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: p.id, name: `#${p.payment_number}` }), hidden: !(can('delete_supplier_payments') && p.status !== 'cancelled') },
          ]} />} />
      </div>
      <PaymentModal isOpen={open} invoices={outstanding} onClose={() => setOpen(false)} onSaved={list.reload} />
      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="md" title={`${t('payment', lang)} #${d?.payment_number || ''}`}>
        {d && <div className="space-y-3"><Dl items={[[t('supplier', lang), d.supplier_name], [t('invoice', lang), d.bill_number && `#${d.bill_number}`], [t('payment_date', lang), dateOnly(d.payment_date)], [t('amount', lang), money(d.amount)], [t('payment_method', lang), t(d.payment_method, lang)], [t('reference_number', lang), d.reference_number], [t('bank_name', lang), d.bank_name], [t('account_number', lang), d.account_number], [t('status', lang), <PStatus key="s" value={d.status} />], [t('created_by', lang), d.created_by_name]]} />{d.notes && <p className="text-sm text-gray-600 text-left">{d.notes}</p>}</div>}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('cancel_payment', lang)} confirmText={t('confirm', lang)} cancelText={t('ui_cancel', lang)} message={t('confirm_cancel_payment', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} loading={busy} />
    </MainLayout>
  );
}
