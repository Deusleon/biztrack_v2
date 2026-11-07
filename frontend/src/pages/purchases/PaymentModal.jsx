// FILE PATH: frontend/src/pages/purchases/PaymentModal.jsx
import { useState, useEffect } from 'react';
import FormModal from '../../components/ui/FormModal';
import { Button, Input, NumberInput, Select, Textarea } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import { formatCurrency, removeNumberFormatting } from '../../utils/numberUtils';
import { num } from './common';
import { t } from '../../utils/i18n';

const METHODS = ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'credit_note'];
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pay a supplier invoice. `invoice` is fixed when opened from an invoice; otherwise `invoices` (outstanding ones) are offered.
 * The amount cannot be more than the balance (the server refuses it too).
 */
export default function PaymentModal({ isOpen, onClose, invoice: fixed, invoices = [], onSaved }) {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const [invoiceId, setInvoiceId] = useState('');
  const [f, setF] = useState({ amount: '', payment_method: 'cash', payment_date: today(), reference_number: '', bank_name: '', account_number: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const invoice = fixed || invoices.find((i) => i.id === invoiceId);
  const balance = num(invoice?.balance_due);
  const money = (v) => formatCurrency(num(v), settings);

  useEffect(() => { if (isOpen) { setInvoiceId(fixed?.id || ''); setF({ amount: fixed ? String(num(fixed.balance_due)) : '', payment_method: 'cash', payment_date: today(), reference_number: '', bank_name: '', account_number: '', notes: '' }); } }, [isOpen, fixed]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    const amount = removeNumberFormatting(f.amount) || 0;
    if (!invoice) { showError(t('select_invoice', lang)); return; }
    if (amount <= 0) { showError(t('amount_required', lang)); return; }
    if (amount > balance + 0.005) { showError(t('payment_exceeds_balance', lang)); return; }
    try {
      setSaving(true);
      const res = await purchaseService.payments.create({ supplier_id: invoice.supplier_id, supplier_invoice_id: invoice.id, amount, payment_method: f.payment_method, payment_date: f.payment_date, reference_number: f.reference_number || undefined, bank_name: f.bank_name || undefined, account_number: f.account_number || undefined, notes: f.notes || undefined });
      showSuccess(res.message); onSaved?.(); onClose();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  return (
    <FormModal isOpen={isOpen} onClose={() => !saving && onClose()} size="md" title={t('record_payment', lang)}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
        {fixed ? <p className="text-sm text-gray-600 text-left">#{fixed.bill_number || fixed.supplier_invoice_number} · {fixed.supplier_name}</p>
          : <Select label={t('invoice', lang)} required searchable value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); const i = invoices.find((x) => x.id === e.target.value); setF((x) => ({ ...x, amount: i ? String(num(i.balance_due)) : '' })); }} placeholder={t('select_invoice', lang)} options={invoices.map((i) => ({ value: i.id, label: `#${i.bill_number || i.supplier_invoice_number} · ${i.supplier_name} · ${money(i.balance_due)}` }))} />}
        {invoice && <p className="text-sm text-left">{t('balance_due', lang)}: <b className="text-red-600">{money(balance)}</b></p>}
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label={t('amount', lang)} required value={f.amount} onChange={set('amount')} />
          <Input type="date" label={t('payment_date', lang)} value={f.payment_date} onChange={set('payment_date')} />
          <Select label={t('payment_method', lang)} value={f.payment_method} onChange={set('payment_method')} options={METHODS.map((m) => ({ value: m, label: t(m, lang) }))} />
          <Input label={t('reference_number', lang)} value={f.reference_number} onChange={set('reference_number')} />
          {f.payment_method === 'bank_transfer' && <><Input label={t('bank_name', lang)} value={f.bank_name} onChange={set('bank_name')} /><Input label={t('account_number', lang)} value={f.account_number} onChange={set('account_number')} /></>}
        </div>
        <Textarea rows={2} label={t('notes', lang)} value={f.notes} onChange={set('notes')} />
        <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t('record_payment', lang)}</Button><Button type="button" variant="secondary" onClick={onClose}>{t('ui_cancel', lang)}</Button></div>
      </form>
    </FormModal>
  );
}
