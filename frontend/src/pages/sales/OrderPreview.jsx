// FILE PATH: frontend/src/pages/sales/OrderPreview.jsx
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { salesService } from '../../services/api';
import { Button, ConfirmModal, FormModal, NumberInput, Select, Textarea } from '../../components/ui';
import { StatusBadge, dateOnly, readableNote, isSystemPayment, readableMethod } from './common';
import { formatCurrency, removeNumberFormatting } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

export default function OrderPreview() {
  const { state } = useLocation();
  const [params] = useSearchParams();
  const code = state?.cartCode || params.get('code');
  const navigate = useNavigate();
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);       // 'cancel' | 'delete' | 'sell'
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const manage = can('manage_pending_invoices');

  const load = useCallback(async () => {
    if (!code) { setLoading(false); return; }
    try { setLoading(true); setOrder(await salesService.getOrder(code)); } catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const lines = order?.cartDatas || [];
  const head = lines[0] || {};
  const payments = (order?.paymentDatas || []).filter((p) => !isSystemPayment(p.payment_method));
  const total = Number(head.total_amount) || lines.reduce((s, l) => s + (Number(l.price) * Number(l.quantity) - Number(l.discount || 0) * Number(l.quantity)), 0);
  const paid = payments.reduce((s, p) => s + (Number(p.amount_paid) || 0) - (Number(p.amount_change) || 0), 0);
  const hasPayment = payments.some((p) => Number(p.amount_paid) > 0);
  const due = Math.max(0, total - paid);
  const cancelled = String(head.status || '').toLowerCase().includes('cancel');

  const run = async (name, fn, okMsg, after) => {
    try { setBusy(name); const r = await fn(); showSuccess(okMsg || r?.message); await (after ? after(r) : load()); }
    catch (err) { showError(err.message); } finally { setBusy(null); setConfirm(null); }
  };

  const pay = () => {
    const a = removeNumberFormatting(amount) || 0;
    if (a <= 0) { showError(t('amount_required', lang)); return; }
    run('pay', () => salesService.recordOrderPayments({ amount: total, amount_paid: a, amount_due: due, cart_code: code, payment_method: method }), 'payment_recorded', () => { setAmount(''); return load(); });
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('order_details', lang)} {order?.order_number ? `#${order.order_number}` : ''}</h1>
            {head.customer_name && <p className="text-sm text-gray-500 mt-0.5">{head.customer_name}{head.customer_phone ? ` · ${head.customer_phone}` : ''} · {dateOnly(head.created_at)}</p>}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/sales/pending')}>{t('back', lang)}</Button>
            {manage && !cancelled && <Button variant="secondary" onClick={() => navigate('/sales/invoice', { state: { fromPendingOrder: true, cartCode: code } })}>{t('edit', lang)}</Button>}
            {manage && !cancelled && <Button onClick={() => setConfirm('sell')} loading={busy === 'sell'}>{t('complete_sale', lang)}</Button>}
            {manage && cancelled && <Button variant="secondary" onClick={() => run('reopen', () => salesService.reopenOrder(code), 'order_reopened')}>{t('reopen', lang)}</Button>}
            {manage && !cancelled && <Button variant="secondary" onClick={() => { if (hasPayment) { setCancelReason(''); setCancelOpen(true); } else setConfirm('cancel'); }}>{t('cancel_order', lang)}</Button>}
            {manage && !hasPayment && <Button variant="danger" onClick={() => setConfirm('delete')}>{t('delete', lang)}</Button>}
          </div>
        </div>

        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && !order && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('order_not_found', lang)}</div>}
        {order && (
          <>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-3 py-2 text-right">{t('quantity', lang)}</th><th className="px-3 py-2 text-right">{t('price', lang)}</th><th className="px-3 py-2 text-right">{t('discount', lang)}</th><th className="px-3 py-2 text-right">{t('total', lang)}</th></tr></thead>
                <tbody>{lines.map((l) => <tr key={l.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{l.name}</td><td className="px-3 py-2 text-right">{Number(l.quantity)}</td><td className="px-3 py-2 text-right">{money(l.price)}</td><td className="px-3 py-2 text-right">{money(l.discount)}</td><td className="px-3 py-2 text-right font-medium">{money(Number(l.price) * Number(l.quantity) - Number(l.discount || 0) * Number(l.quantity))}</td></tr>)}</tbody></table>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded shadow p-4 space-y-2 text-sm text-left">
                <div className="flex justify-between"><span className="text-gray-500">{t('total', lang)}</span><b>{money(total)}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('amount_paid', lang)}</span><span>{money(paid)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('amount_due', lang)}</span><b className={due > 0 ? 'text-red-600' : 'text-green-600'}>{money(due)}</b></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('status', lang)}</span><StatusBadge value={head.status} /></div>
                {head.note && <p className="text-gray-600 border-t border-gray-100 pt-2">{readableNote(head.note, lang)}</p>}
              </div>
              <div className="bg-white rounded shadow p-4 space-y-3 text-left">
                <h2 className="text-sm font-semibold text-gray-700">{t('payments', lang)}</h2>
                {payments.length === 0 && <p className="text-sm text-gray-400">{t('ui_nothing_yet', lang)}</p>}
                <ul className="divide-y divide-gray-100 text-sm">{payments.map((p, i) => <li key={p.id || i} className="py-1.5 flex justify-between"><span>{dateOnly(p.created_at)} · {readableMethod(p.payment_method, lang)}</span><span>{money(p.amount_paid)}</span></li>)}</ul>
                {manage && !cancelled && due > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                    <NumberInput label={t('amount_paid', lang)} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <Select label={t('payment_method', lang)} value={method} onChange={(e) => setMethod(e.target.value)} options={['cash', 'mobile_money', 'bank_transfer'].map((m) => ({ value: m, label: t(m, lang) }))} />
                    <div className="col-span-2 flex justify-end"><Button loading={busy === 'pay'} onClick={pay}>{t('record_payment', lang)}</Button></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <ConfirmModal isOpen={!!confirm} variant={confirm === 'delete' ? 'danger' : 'warning'} title={t(confirm === 'sell' ? 'complete_sale' : confirm === 'cancel' ? 'cancel_order' : 'delete', lang)} confirmText={t('confirm', lang)} cancelText={t('ui_cancel', lang)}
        message={t(confirm === 'sell' ? 'confirm_complete_sale' : confirm === 'cancel' ? 'confirm_cancel_order' : 'confirm_delete_order', lang)} onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'sell') run('sell', () => salesService.sellOrder(code), 'sale_processed_successfully', (res) => { if (settings?.enableReceiptPrinting && res?.invoice_number) navigate('/sales/receipt', { state: { saleData: res } }); else navigate('/sales/pending'); });
          else if (confirm === 'cancel') run('cancel', () => salesService.cancelOrder(code), 'order_cancelled');
          else run('delete', () => salesService.deleteOrder(code), 'order_deleted', () => navigate('/sales/pending'));
        }} />
      <FormModal isOpen={cancelOpen} title={t('cancel_order', lang)} onClose={() => setCancelOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('cancel_reason_required', lang)}</p>
          <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t('cancel_reason_placeholder', lang)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>{t('ui_cancel', lang)}</Button>
            <Button variant="danger" loading={busy === 'cancel'} onClick={() => {
              if (cancelReason.trim().length < 3) { showError(t('cancel_reason_required', lang)); return; }
              setCancelOpen(false);
              run('cancel', () => salesService.cancelOrder(code, cancelReason.trim()), 'order_cancelled', () => load());
            }}>{t('cancel_order', lang)}</Button>
          </div>
        </div>
      </FormModal>
    </MainLayout>
  );
}
