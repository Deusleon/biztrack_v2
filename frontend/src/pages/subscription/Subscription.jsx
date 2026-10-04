// FILE PATH: frontend/src/pages/subscription/Subscription.jsx
import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscriptionService } from '../../services/api';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Button, Input } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { downloadSubscriptionReceipt } from '../../utils/subscriptionReceiptPdf';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { normalizePhone } from '../messaging/common';
import { t } from '../../utils/i18n';

const money = (v, cur = 'TZS') => `${cur} ${formatNumberWithCommas(Number(v) || 0)}`;
const day = (v) => (v ? new Date(v).toLocaleDateString() : '—');
const daysLeft = (v) => (v ? Math.ceil((new Date(v).getTime() - Date.now()) / 864e5) : null);
const TONE = { active: 'bg-green-50 text-green-700', grace: 'bg-amber-50 text-amber-700', expired: 'bg-red-50 text-red-700', paid: 'bg-green-50 text-green-700', pending: 'bg-amber-50 text-amber-700', failed: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-600', expired_tx: 'bg-red-50 text-red-700' };

export default function Subscription() {
  const { can, user } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError, showWarning } = useToast();
  const { lang } = useLanguage();
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState('monthly');
  const [checkout, setCheckout] = useState(null);       // { plan, phone, name, email }
  const [paying, setPaying] = useState(null);           // { transactionId, amount, currency } waiting for the phone prompt
  const [busy, setBusy] = useState(false);
  const canPay = can('view_subscription');

  const load = useCallback(async () => { try { const [p, s, h] = await Promise.all([subscriptionService.plans(), subscriptionService.me(), subscriptionService.history()]); setPlans(p); setSub(s); setHistory(h); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['subscriptionPaymentUpdated'], load);

  // while a payment waits for the person to confirm on their phone, ask ClickPesa every few seconds
  useEffect(() => {
    if (!paying) return undefined;
    let stop = false;
    const id = setInterval(async () => {
      try { const r = await subscriptionService.verify(paying.transactionId); if (stop) return; if (r.status === 'paid') { setPaying(null); showSuccess(t('payment_successful', lang)); load(); } else if (['failed', 'expired', 'cancelled'].includes(r.status)) { setPaying(null); showError(t('payment_failed', lang)); load(); } } catch { /* try again */ }
    }, 6000);
    return () => { stop = true; clearInterval(id); };
  }, [paying]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (plan) => setCheckout({ plan, phone: '', name: user?.name || '', email: user?.email || '' });
  const pay = async () => {
    const phone = normalizePhone(checkout.phone);
    if (!phone) { showError(t('invalid_phone_number', lang)); return; }
    try {
      setBusy(true);
      const c = await subscriptionService.checkout({ planCode: checkout.plan.code, billingCycle: cycle, phoneNumber: phone, customerName: checkout.name, customerEmail: checkout.email });
      setPaying({ transactionId: c.transactionId, amount: c.amount, currency: c.currency }); setCheckout(null); showWarning(t('confirm_payment_on_phone', lang));
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  const checkNow = async () => { try { const r = await subscriptionService.verify(paying.transactionId); if (r.status === 'paid') { setPaying(null); showSuccess(t('payment_successful', lang)); load(); } else showWarning(t('payment_still_pending', lang)); } catch (err) { showError(err.message); } };

  const left = daysLeft(sub?.ends_at); const state = !sub ? null : left != null && left >= 0 ? 'active' : sub.grace_ends_at && daysLeft(sub.grace_ends_at) >= 0 ? 'grace' : 'expired';
  const saving = (p) => { const m = Number(p.monthly_amount) * 12; return m > 0 ? Math.round((1 - Number(p.annual_amount) / m) * 100) : 0; };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('subscription', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{currentStore?.name}</p></div>
        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && (
          <div className="bg-white rounded shadow p-5 text-left space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="text-sm font-semibold text-gray-800">{t('current_plan', lang)}</h2>{state && <span className={`px-2 py-0.5 rounded text-xs font-medium ${TONE[state]}`}>{t(`subscription_${state}`, lang)}</span>}</div>
            {!sub ? <p className="text-sm text-gray-500">{t('no_active_subscription', lang)}</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                {[['plan', sub.plan_name], ['billing_cycle', t(sub.current_cycle, lang)], ['started', day(sub.starts_at)], ['expires', `${day(sub.ends_at)}${left != null ? ` (${left >= 0 ? left : 0} ${t('days', lang)})` : ''}`], ['grace_period_until', day(sub.grace_ends_at)], ['last_payment', day(sub.last_payment_at)]].map(([k, v]) => <div key={k}><p className="text-[11px] uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-gray-800">{v || '—'}</p></div>)}
              </div>
            )}
          </div>
        )}

        {paying && <div className="bg-amber-50 border border-amber-200 rounded p-4 text-left flex items-center justify-between gap-3 flex-wrap"><p className="text-sm text-amber-800">{t('confirm_payment_on_phone', lang)} · {money(paying.amount, paying.currency)}</p><div className="flex gap-2"><Button variant="secondary" onClick={checkNow}>{t('check_status', lang)}</Button><Button variant="secondary" onClick={() => setPaying(null)}>{t('cancel', lang)}</Button></div></div>}

        {!loading && plans.length > 0 && (<>
          <div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="text-sm font-semibold text-gray-800">{t('choose_plan', lang)}</h2><div className="flex gap-2">{['monthly', 'annual'].map((c) => <button key={c} type="button" onClick={() => setCycle(c)} className={`px-3 py-1.5 text-sm rounded border ${cycle === c ? 'border-primary bg-primary-10 text-primary font-medium' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>{t(c, lang)}</button>)}</div></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{plans.map((p) => { const mine = sub?.plan_code === p.code; return (
            <div key={p.id} className={`bg-white rounded shadow p-5 text-left space-y-3 border-2 ${mine ? 'border-primary' : 'border-transparent'}`}>
              <div><h3 className="text-base font-bold text-gray-900">{p.name}{mine && <span className="ml-2 text-xs text-primary">● {t('current', lang)}</span>}</h3><p className="text-xs text-gray-500">{p.description}</p></div>
              <p className="text-2xl font-bold text-gray-900">{money(cycle === 'annual' ? p.annual_amount : p.monthly_amount, p.currency)}<span className="text-xs font-normal text-gray-500"> / {t(cycle === 'annual' ? 'year' : 'month', lang)}</span></p>
              {cycle === 'annual' && saving(p) > 0 && <p className="text-xs text-green-700">{t('save', lang)} {saving(p)}%</p>}
              <ul className="text-sm text-gray-600 space-y-1">{p.metadata?.maxUsers != null && <li>• {t('up_to_users', lang, { count: p.metadata.maxUsers })}</li>}{p.metadata?.maxStores != null && <li>• {t('up_to_stores', lang, { count: p.metadata.maxStores })}</li>}</ul>
              {canPay && <Button className="w-full" variant={mine ? 'secondary' : 'primary'} onClick={() => start(p)}>{t(mine ? 'renew' : 'choose', lang)}</Button>}
            </div>); })}</div>
          {!canPay && <p className="text-xs text-gray-500 text-left">{t('only_owner_can_pay', lang)}</p>}
        </>)}

        {history.length > 0 && (
          <div className="bg-white rounded shadow p-5 text-left space-y-3"><h2 className="text-sm font-semibold text-gray-800">{t('payment_history', lang)}</h2>
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('date', lang)}</th><th className="px-3 py-2 text-left">{t('plan', lang)}</th><th className="px-3 py-2 text-left">{t('billing_cycle', lang)}</th><th className="px-3 py-2 text-right">{t('amount', lang)}</th><th className="px-3 py-2 text-left">{t('status', lang)}</th><th className="w-20" /></tr></thead>
              <tbody>{history.map((h) => <tr key={h.id} className="border-t border-gray-100"><td className="px-3 py-2 whitespace-nowrap">{day(h.paid_at || h.created_at)}</td><td className="px-3 py-2">{h.plan_name || h.plan_code || '—'}</td><td className="px-3 py-2">{t(h.billing_cycle, lang)}</td><td className="px-3 py-2 text-right">{money(h.amount, h.currency)}</td><td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${TONE[h.status] || 'bg-gray-100 text-gray-600'}`}>{t(h.status, lang)}</span></td><td className="px-2">{h.status === 'paid' && <button type="button" className="text-xs text-primary hover:underline" onClick={() => downloadSubscriptionReceipt(h, currentStore)}>{t('receipt', lang)}</button>}{h.status === 'pending' && canPay && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPaying({ transactionId: h.id, amount: h.amount, currency: h.currency })}>{t('check_status', lang)}</button>}</td></tr>)}</tbody></table></div></div>
        )}
      </div>
      <FormModal isOpen={!!checkout} onClose={() => !busy && setCheckout(null)} size="sm" title={`${t('pay_for', lang)} ${checkout?.plan?.name || ''}`}>
        {checkout && <form onSubmit={(e) => { e.preventDefault(); pay(); }} className="space-y-4 text-left" noValidate><p className="text-sm text-gray-700">{money(cycle === 'annual' ? checkout.plan.annual_amount : checkout.plan.monthly_amount, checkout.plan.currency)} · {t(cycle, lang)}</p><Input label={t('mobile_money_phone', lang)} required autoFocus value={checkout.phone} onChange={(e) => setCheckout((c) => ({ ...c, phone: e.target.value }))} placeholder="255712345678" helperText={t('payment_prompt_hint', lang)} /><Input label={t('full_name', lang)} value={checkout.name} onChange={(e) => setCheckout((c) => ({ ...c, name: e.target.value }))} /><Input type="email" label={t('email', lang)} value={checkout.email} onChange={(e) => setCheckout((c) => ({ ...c, email: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{t('pay_now', lang)}</Button><Button type="button" variant="secondary" onClick={() => setCheckout(null)}>{t('cancel', lang)}</Button></div></form>}
      </FormModal>
    </MainLayout>
  );
}
