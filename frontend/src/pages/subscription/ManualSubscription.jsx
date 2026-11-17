// FILE PATH: frontend/src/pages/subscription/ManualSubscription.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscriptionService } from '../../services/api';
import useDeveloperAccess from '../../hooks/useDeveloperAccess';
import { Button, Input, Loader, Select, Textarea, ConfirmModal } from '../../components/ui';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const money = (v, cur = 'TZS') => `${cur} ${formatNumberWithCommas(Number(v) || 0)}`;
/** 6–11 months 10%. 12–23 months 15%, the same as a year. 24 months 20%. Must match the server. */
const prepaidQuote = (monthly, count) => {
  const months = Math.min(24, Math.max(1, parseInt(count, 10) || 1));
  const gross = (Number(monthly) || 0) * months;
  const rate = months >= 24 ? 0.2 : months >= 12 ? 0.15 : months >= 6 ? 0.1 : 0;
  const discount = Math.round(gross * rate);
  return { months, gross, rate, discount, amount: gross - discount };
};
/** A year is twelve months, then 15% off. Must match the server. */
const annualQuote = (monthly) => {
  const gross = (Number(monthly) || 0) * 12;
  const discount = Math.round(gross * 0.15);
  return { months: 12, gross, rate: 0.15, discount, amount: gross - discount };
};
const day = (v) => (v ? new Date(v).toLocaleDateString() : '—');
const daysLeft = (v) => (v ? Math.ceil((new Date(v).getTime() - Date.now()) / 864e5) : null);

/** Same extension rule as the server: add the months onto a still-running end date, otherwise start from today. */
function nextEnd(store, months) {
  let base = new Date();
  if (store?.status === 'active' && store.ends_at) {
    const end = new Date(store.ends_at);
    if (end > base) base = end;
  }
  const ends = new Date(base);
  ends.setMonth(ends.getMonth() + months);
  return ends;
}

const METHODS = ['cash', 'bank_transfer', 'mobile_money', 'other'];

export default function ManualSubscription() {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { isDeveloper, loading: accessLoading } = useDeveloperAccess();
  const [stores, setStores] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [monthCount, setMonthCount] = useState('1');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (accessLoading) return undefined;
    if (!isDeveloper) { setLoading(false); return undefined; }
    let live = true;
    Promise.all([subscriptionService.manualStores(), subscriptionService.plans()])
      .then(([rows, p]) => { if (live) { setStores(rows); setPlans(p); } })
      .catch((err) => { if (live) showError(err.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [isDeveloper, accessLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const store = stores.find((s) => s.id === storeId) || null;
  const plan = plans.find((p) => p.code === planCode) || null;
  const months = cycle === 'annual' ? 12 : Math.min(24, Math.max(1, parseInt(monthCount, 10) || 1));
  const quote = plan ? (cycle === 'annual' ? annualQuote(plan.monthly_amount) : prepaidQuote(plan.monthly_amount, months)) : null;
  const expiry = store && quote ? nextEnd(store, quote.months) : null;
  const left = daysLeft(store?.ends_at);
  const state = !store?.status ? null : left != null && left >= 0 ? 'active' : store.grace_ends_at && daysLeft(store.grace_ends_at) >= 0 ? 'grace' : 'expired';

  const pickStore = (id) => {
    setStoreId(id);
    const row = stores.find((s) => s.id === id);
    if (row?.plan_code) setPlanCode(row.plan_code);
    if (row?.owner_phone) setPhone(row.owner_phone);
  };

  const ask = () => {
    if (!storeId) { showError(t('store_required', lang)); return; }
    if (!planCode) { showError(t('subscription_plan_required', lang)); return; }
    if (reference.trim().length < 3) { showError(t('payment_reference_required', lang)); return; }
    setConfirm(true);
  };

  const save = async () => {
    try {
      setBusy(true);
      const r = await subscriptionService.recordManual({
        storeId,
        planCode,
        billingCycle: cycle,
        months: cycle === 'monthly' ? months : undefined,
        paymentMethod: method,
        reference: reference.trim(),
        phoneNumber: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      showSuccess(r.message || t('record_manual_subscription', lang));
      setReference('');
      setNote('');
      setConfirm(false);
      setStores(await subscriptionService.manualStores());
    } catch (err) {
      showError(err.message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left">
          <h1 className="text-xl font-bold text-gray-900">{t('extend_subscription', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{t('extend_subscription_help', lang)}</p>
        </div>

        {(accessLoading || loading) && <Loader />}
        {!accessLoading && !isDeveloper && <p className="text-sm text-gray-600 bg-white rounded shadow p-5 text-left">{t('developer_only_page', lang)}</p>}

        {!loading && isDeveloper && (
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="bg-white rounded shadow p-5 text-left space-y-4" noValidate>
            <Select
              label={t('select_store', lang)}
              required
              searchable
              value={storeId}
              onChange={(e) => pickStore(e.target.value)}
              placeholder={t('select_store', lang)}
              options={stores.map((s) => ({ value: s.id, label: `${s.name} · ${s.store_code}${s.owner_name ? ` · ${s.owner_name}` : ''}` }))}
            />

            {store && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border border-gray-100 rounded p-3">
                {[['plan', store.plan_name], ['status', state ? t(`subscription_${state}`, lang) : '—'], ['expires', store.ends_at ? `${day(store.ends_at)}${left != null ? ` (${Math.max(left, 0)} ${t('days', lang)})` : ''}` : '—'], ['owner', store.owner_email || store.owner_name || '—']].map(([k, v]) => (
                  <div key={k}><p className="text-[11px] uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-gray-800">{v || '—'}</p></div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label={t('plan', lang)} required value={planCode} onChange={(e) => setPlanCode(e.target.value)} placeholder={t('choose_plan', lang)} options={plans.map((p) => ({ value: p.code, label: `${p.name} · ${money(p.monthly_amount, p.currency)} / ${t('month', lang)}` }))} />
              <Select label={t('billing_cycle', lang)} value={cycle} onChange={(e) => setCycle(e.target.value)} options={['monthly', 'annual'].map((c) => ({ value: c, label: t(c, lang) }))} />
              {cycle === 'monthly' && <Input label={t('months_to_pay', lang)} inputMode="numeric" value={monthCount} onChange={(e) => setMonthCount(e.target.value.replace(/\D/g, '').slice(0, 2))} helperText={t('months_to_pay_hint', lang)} />}
              <Select label={t('payment_method', lang)} value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS.map((m) => ({ value: m, label: t(m, lang) }))} />
              <Input label={t('reference_number', lang)} required value={reference} onChange={(e) => setReference(e.target.value)} helperText={t('manual_reference_hint', lang)} />
              <Input label={t('phone_number', lang)} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="255712345678" helperText={t('manual_phone_hint', lang)} />
            </div>
            <Textarea label={t('note', lang)} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />

            {quote && (
              <div className="border border-gray-100 rounded p-3 text-sm space-y-1">
                <p>{t('amount_to_pay', lang)}: <b>{money(quote.amount, plan.currency)}</b>{quote.discount > 0 ? ` · ${t('prepaid_discount', lang, { percent: Math.round(quote.rate * 100) })} · ${money(quote.discount, plan.currency)}` : ''}</p>
                <p>{t('months_paid', lang)}: <b>{quote.months}</b></p>
                <p>{t('new_expiry', lang)}: <b>{expiry ? expiry.toLocaleDateString() : '—'}</b></p>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!store || !plan}>{t('extend_subscription', lang)}</Button>
            </div>
          </form>
        )}
      </div>

      <ConfirmModal
        isOpen={confirm}
        variant="warning"
        title={t('extend_subscription', lang)}
        confirmText={t('confirm', lang)}
        cancelText={t('ui_cancel', lang)}
        message={t('confirm_extend_subscription', lang, { date: expiry ? expiry.toLocaleDateString() : '—' })}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={save}
      />
    </MainLayout>
  );
}
