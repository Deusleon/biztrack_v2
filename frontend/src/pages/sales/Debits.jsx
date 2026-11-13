// FILE PATH: frontend/src/pages/sales/Debits.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { salesService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, Button, RowActions, ACTION_ICONS, NumberInput, Select, Input, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { FilterBar, StatusBadge, DetailGrid, toPaging, dateOnly } from './common';
import { formatCurrency, removeNumberFormatting } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const fetchCredit = async ({ page, limit, search, status, startDate, endDate }) => {
  const r = await salesService.credit({ page, limit, search: search || undefined, status: status || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.credit_sales || [], pagination: toPaging(r.pagination, limit), summary: r.summary };
};

export default function Debits() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const list = useServerList({ fetcher: fetchCredit, initialFilters: { search: '', status: '', startDate: '', endDate: '' } });
  useLiveRefresh(['newSale', 'creditPayment', 'sales_return'], list.reload);
  const [detail, setDetail] = useState(null);
  const [panel, setPanel] = useState(null);          // { kind: 'pay' | 'notify', sale }
  const [form, setForm] = useState({ amount: '', method: 'cash', reference: '', notes: '', message: '' });
  const [busy, setBusy] = useState(false);
  const manage = can('manage_credit_sales');
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const summary = list.summary || {};

  const view = async (c) => { try { setDetail(await salesService.creditDetails(c.id)); } catch (err) { showError(err.message); } };
  const openPanel = (kind, sale) => { setForm({ amount: '', method: 'cash', reference: '', notes: '', message: kind === 'notify' ? t('credit_reminder_default', lang, { name: sale.customer_name || '', amount: money(sale.amount_due), invoice: sale.invoice_number }) : '' }); setPanel({ kind, sale }); };

  const submit = async () => {
    const sale = panel.sale;
    try {
      setBusy(true);
      if (panel.kind === 'pay') {
        const amount = removeNumberFormatting(form.amount) || 0;
        if (amount <= 0) { showError(t('amount_required', lang)); return; }
        if (amount > Number(sale.amount_due)) { showError(t('payment_exceeds_due', lang)); return; }
        const r = await salesService.recordCreditPayment(sale.id, { amount, paymentMethod: form.method, referenceNumber: form.reference || undefined, notes: form.notes || undefined });
        showSuccess(r.message || 'payment_recorded');
      } else {
        const r = await salesService.notifyCredit(sale.id, { message: form.message });
        showSuccess(r.message || 'notification_sent');
      }
      setPanel(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const markOverdue = async () => { try { const r = await salesService.markOverdue(); showSuccess(r.message || 'done'); list.reload(); } catch (err) { showError(err.message); } };

  const columns = [
    { key: 'invoice_number', label: t('invoice_number', lang), render: (c) => <span className="font-medium text-gray-900">#{c.invoice_number}</span> },
    { key: 'customer_name', label: t('customer', lang), render: (c) => <div><div>{c.customer_name}</div><div className="text-xs text-gray-400">{c.customer_phone}</div></div> },
    { key: 'total_amount', label: t('total', lang), align: 'right', render: (c) => money(c.total_amount) },
    { key: 'amount_paid', label: t('amount_paid', lang), align: 'right', render: (c) => money(c.amount_paid) },
    { key: 'amount_due', label: t('amount_due', lang), align: 'right', render: (c) => <span className="text-red-600 font-medium">{money(c.amount_due)}</span> },
    { key: 'due_date', label: t('due_date', lang), render: (c) => dateOnly(c.due_date) || '—' },
    { key: 'status', label: t('status', lang), render: (c) => <StatusBadge value={c.status} /> },
    { key: 'created_by_name', label: t('created_by', lang), render: (c) => c.created_by_name || '—' },
  ];
  const cs = detail?.credit_sale;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('debits', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_debits', lang)}</p></div>
          {manage && <Button variant="secondary" onClick={markOverdue}>{t('mark_overdue', lang)}</Button>}
        </div>
        {Object.keys(summary).length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(summary).filter(([, v]) => typeof v !== 'object').slice(0, 4).map(([k, v]) => (
              <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{t(k, lang) === k ? k.replace(/_/g, ' ') : t(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1">{/(amount|due|paid|total|balance|outstanding)/i.test(k) ? money(v) : Number(v)}</p></div>
            ))}
          </div>
        )}
        <FilterBar list={list} statusKey="status" statusOptions={['not_paid', 'partial_paid', 'overdue', 'paid']} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(c) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => view(c) },
            { label: t('record_payment', lang), icon: ACTION_ICONS.edit, onClick: () => openPanel('pay', c), hidden: !manage || Number(c.amount_due) <= 0 },
            { label: t('send_reminder', lang), icon: ACTION_ICONS.upload, onClick: () => openPanel('notify', c), hidden: !manage || Number(c.amount_due) <= 0 },
          ]} />} />
      </div>

      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="xl" title={`${t('invoice', lang)} #${cs?.invoice_number || ''}`}>
        {detail && cs && (
          <div className="space-y-5 text-left">
            <DetailGrid items={[
              [t('customer', lang), cs.customer_name],
              [t('phone', lang), cs.customer_phone],
              [t('date', lang), dateOnly(cs.created_at)],
              [t('due_date', lang), dateOnly(cs.due_date)],
              [t('created_by', lang), cs.created_by_name],
              [t('status', lang), <StatusBadge value={cs.status} />],
              [t('total', lang), money(cs.total_amount)],
              [t('amount_paid', lang), money(cs.amount_paid)],
              [t('amount_due', lang), <span className={Number(cs.amount_due) > 0 ? 'text-red-600' : 'text-green-700'}>{money(cs.amount_due)}</span>],
            ]} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="table-cards w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('total', lang)}</th></tr></thead>
                  <tbody>{(detail.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2.5">{i.name}</td><td className="px-3 py-2.5 text-right">{Number(i.quantity)}</td><td className="px-3 py-2.5 text-right font-medium">{money(Number(i.price) * Number(i.quantity))}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="border border-gray-200 rounded-md">
                <h4 className="px-3 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border-b border-gray-100">{t('payments', lang)}</h4>
                {(detail.payments || []).length === 0 && <p className="px-3 py-4 text-sm text-gray-400">{t('ui_nothing_yet', lang)}</p>}
                <ul className="divide-y divide-gray-100 text-sm">{(detail.payments || []).map((p, i) => <li key={p.id || i} className="px-3 py-2.5 flex justify-between gap-3"><span className="text-gray-600">{dateOnly(p.created_at || p.payment_date)} · {t(p.payment_method, lang)}{p.received_by ? ` · ${t('recorded_by', lang)}: ${p.received_by}` : ''}</span><span className="font-medium">{money(p.amount)}</span></li>)}</ul>
              </div>
            </div>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={!!panel} onClose={() => !busy && setPanel(null)} size="sm" title={panel?.kind === 'pay' ? t('record_payment', lang) : t('send_reminder', lang)}>
        {panel && (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <p className="text-sm text-gray-600 text-left">#{panel.sale.invoice_number} · {panel.sale.customer_name} · {t('amount_due', lang)}: <b>{money(panel.sale.amount_due)}</b></p>
            {panel.kind === 'pay' ? (<>
              <NumberInput label={t('amount_paid', lang)} required autoFocus value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              <Select label={t('payment_method', lang)} value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} options={['cash', 'mobile_money', 'bank_transfer'].map((m) => ({ value: m, label: t(m, lang) }))} />
              <Input label={t('reference_number', lang)} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
              <Textarea rows={2} label={t('notes', lang)} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </>) : (
              <Textarea rows={4} label={t('message', lang)} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            )}
            <div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{panel.kind === 'pay' ? t('record_payment', lang) : t('send', lang)}</Button><Button type="button" variant="secondary" onClick={() => setPanel(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>
    </MainLayout>
  );
}
