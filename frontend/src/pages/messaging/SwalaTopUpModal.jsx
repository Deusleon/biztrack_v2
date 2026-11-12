import { useEffect, useRef, useState } from 'react';
import FormModal from '../../components/ui/FormModal';
import { Button, NumberInput, PhoneInput, Select } from '../../components/ui';
import { messagingService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { t } from '../../utils/i18n';

const money = (amount, currency) => (amount === null || amount === undefined || amount === '' ? '' : `${currency || ''} ${Number(amount).toLocaleString()}`.trim());
const POLL_MS = 4000;
const POLL_TRIES = 45;

/** Buy SwalaSMS credits inside BizTrack: a package or a custom amount, then mobile money or a card link. */
export default function SwalaTopUpModal({ isOpen, onClose, onPaid }) {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ country_uid: '', mode: 'custom', package_uid: '', units: '', payment_gateway: '', phone: '' });
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const timer = useRef(null);

  const load = async (countryUid) => {
    try {
      const res = await messagingService.walletOptions(countryUid);
      const d = res.data || res;
      setOptions(d);
      setLoadError('');
      setForm((f) => ({
        ...f,
        country_uid: d.country_uid || f.country_uid,
        mode: d.packages?.length && !f.units ? 'package' : f.mode,
        package_uid: d.packages?.[0]?.uid || f.package_uid,
        payment_gateway: d.payment_methods?.some((m) => m.code === f.payment_gateway) ? f.payment_gateway : (d.payment_methods?.[0]?.code || ''),
      }));
    } catch (err) { setLoadError(err.message); }
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    setOrder(null);
    setQuote(null);
    load();
    return () => clearInterval(timer.current);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const method = options?.payment_methods?.find((m) => m.code === form.payment_gateway);
  const needsPhone = method ? method.requires_phone !== false : true;

  const checkPrice = async () => {
    if (!(Number(form.units) >= 1)) { showError(t('swala_units_required', lang)); return; }
    try {
      setBusy(true);
      const res = await messagingService.quoteWallet({ country_uid: form.country_uid, units: Number(form.units) });
      setQuote(res.data || res);
    } catch (err) { setQuote(null); showError(err.message); } finally { setBusy(false); }
  };

  const follow = (orderUid) => {
    let tries = 0;
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      tries += 1;
      try {
        const res = await messagingService.walletTopUpStatus(orderUid);
        const o = res.data || res;
        if (o?.status === 'paid') {
          clearInterval(timer.current);
          setOrder((cur) => ({ ...cur, status: 'paid' }));
          showSuccess(t('swala_topup_paid', lang));
          onPaid?.();
        } else if (o?.payment?.status === 'failed') {
          clearInterval(timer.current);
          setOrder((cur) => ({ ...cur, status: 'failed' }));
        }
      } catch { /* the next poll tries again */ }
      if (tries >= POLL_TRIES) clearInterval(timer.current);
    }, POLL_MS);
  };

  const pay = async () => {
    const usingPackage = form.mode === 'package' && form.package_uid;
    if (!usingPackage && !(Number(form.units) >= 1)) { showError(t('swala_units_required', lang)); return; }
    if (!form.payment_gateway) { showError(t('payment_method_required', lang)); return; }
    if (needsPhone && !form.phone) { showError(t('amount_and_phone_required', lang)); return; }
    try {
      setBusy(true);
      const res = await messagingService.walletTopUp({
        country_uid: form.country_uid,
        payment_gateway: form.payment_gateway,
        phone: needsPhone ? form.phone : undefined,
        ...(usingPackage ? { package_uid: form.package_uid } : { units: Number(form.units) }),
      });
      const d = res.data || {};
      setOrder({ orderUid: d.orderUid, status: d.status || 'pending', payment: d.payment, sandbox: d.sandbox, message: res.message });
      if (d.orderUid && d.status !== 'paid' && !d.sandbox) follow(d.orderUid);
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const packages = options?.packages || [];
  const countries = options?.countries || [];

  return (
    <FormModal isOpen={isOpen} onClose={onClose} size="md" title={t('buy_sms_credits', lang)}>
      <div className="space-y-4 text-left">
        {loadError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{loadError}</p>}
        {!options && !loadError && <p className="text-sm text-gray-500 py-6 text-center">{t('loading_data', lang)}</p>}
        {options && !order && (
          <>
            {countries.length > 1 && (
              <Select label={t('country', lang)} value={form.country_uid} onChange={(e) => { setForm((f) => ({ ...f, country_uid: e.target.value })); setQuote(null); load(e.target.value); }}
                options={countries.map((c) => ({ value: c.uid, label: c.name || c.iso2 }))} />
            )}
            {packages.length > 0 && (
              <div className="flex gap-2">
                {[['package', 'a_package'], ['custom', 'custom_amount']].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, mode: key }))} className={`flex-1 text-sm px-3 py-2 rounded border ${form.mode === key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{t(label, lang)}</button>
                ))}
              </div>
            )}
            {form.mode === 'package' && packages.length > 0 ? (
              <Select label={t('package', lang)} value={form.package_uid} onChange={(e) => setForm((f) => ({ ...f, package_uid: e.target.value }))}
                options={packages.map((p) => ({ value: p.uid, label: `${p.name ? `${p.name} — ` : ''}${Number(p.units).toLocaleString()} ${t('sms_unit', lang)}${p.amount ? ` · ${money(p.amount, p.currency)}` : ''}` }))} />
            ) : (
              <div className="space-y-2">
                <NumberInput label={t('sms_credits', lang)} allowDecimals={false} value={form.units} onChange={(e) => { setForm((f) => ({ ...f, units: e.target.value })); setQuote(null); }} placeholder="5000" />
                <div className="flex items-center gap-3 flex-wrap">
                  <Button type="button" variant="secondary" onClick={checkPrice} loading={busy} disabled={!form.units}>{t('check_price', lang)}</Button>
                  {quote && <span className="text-sm text-gray-700">{Number(quote.units || form.units).toLocaleString()} {t('sms_unit', lang)} · <strong>{money(quote.amount ?? quote.total, quote.currency)}</strong></span>}
                </div>
              </div>
            )}
            <Select label={t('payment_method', lang)} value={form.payment_gateway} onChange={(e) => setForm((f) => ({ ...f, payment_gateway: e.target.value }))}
              options={(options.payment_methods || []).map((m) => ({ value: m.code, label: m.name || m.label || m.code }))} />
            {needsPhone && <PhoneInput label={t('phone_number', lang)} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} helperText={t('payment_prompt_hint', lang)} />}
            {!needsPhone && form.payment_gateway && <p className="text-xs text-gray-500">{t('card_payment_hint', lang)}</p>}
            <div className="flex justify-end gap-3"><Button type="button" onClick={pay} loading={busy}>{t('pay_now', lang)}</Button><Button type="button" variant="secondary" onClick={onClose}>{t('close', lang)}</Button></div>
          </>
        )}
        {order && (
          <div className="space-y-3">
            <div className={`rounded px-3 py-3 text-sm border ${order.status === 'paid' ? 'bg-green-50 border-green-200 text-green-800' : order.status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              {order.status === 'paid' ? t('swala_topup_paid', lang) : order.status === 'failed' ? t('swala_topup_failed', lang) : (order.message || t('swala_topup_prompt', lang))}
            </div>
            {order.payment?.redirectUrl && order.status !== 'paid' && <a href={order.payment.redirectUrl} target="_blank" rel="noopener noreferrer" className="inline-block bg-primary text-white text-sm px-4 py-2 rounded hover:opacity-90">{t('open_payment_page', lang)}</a>}
            {order.status === 'pending' && !order.sandbox && <p className="text-xs text-gray-500">{t('waiting_for_payment', lang)}</p>}
            <div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>{t('close', lang)}</Button></div>
          </div>
        )}
      </div>
    </FormModal>
  );
}
