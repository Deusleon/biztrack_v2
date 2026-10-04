// FILE PATH: frontend/src/pages/messaging/Account.jsx
import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { Button, Input, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { normalizePhone } from './common';
import { t } from '../../utils/i18n';

/** SMS balance and statistics, top-up (USSD push / ZenoPay / a request to support, whatever the gateway supports) and sender IDs. */
export default function Account() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [info, setInfo] = useState(null);
  const [stats, setStats] = useState(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [senders, setSenders] = useState([]);
  const [busy, setBusy] = useState(null);
  const [ussd, setUssd] = useState({ amountTzs: '', phone: '' });
  const [zeno, setZeno] = useState({ amount: '', buyerName: '', buyerPhone: '', orderId: '' });
  const [sender, setSender] = useState(null);
  const manage = can('manage_messaging_account');

  const load = useCallback(async () => {
    try {
      setLoading(true); setNotSetUp(false);
      const gi = await messagingService.gatewayInfo(); setInfo(gi);
      if (!gi.configured) { setNotSetUp(true); setStats(null); return; }
      try { setStats(await messagingService.accountStats()); } catch (e) { if (e.code === 'no_default_sms_gateway') setNotSetUp(true); else showError(e.message); }
      if (gi.capabilities?.listSenderIds !== false) messagingService.senderIds().then(setSenders).catch(() => {});
    } catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, okKey) => { try { setBusy(key); const r = await fn(); showSuccess(r?.message || t(okKey, lang)); return r; } catch (err) { showError(err.message); return null; } finally { setBusy(null); } };
  const cap = info?.capabilities || {};
  const payUssd = () => { const phone = normalizePhone(ussd.phone); if (!ussd.amountTzs || !phone) { showError(t('amount_and_phone_required', lang)); return; } act('ussd', () => messagingService.topupUssd({ amountTzs: Number(ussd.amountTzs), phone }), 'ussd_push_sent').then((r) => r && load()); };
  const payZeno = async () => { const phone = normalizePhone(zeno.buyerPhone); if (!zeno.amount || !phone || !zeno.buyerName.trim()) { showError(t('amount_and_phone_required', lang)); return; } const r = await act('zeno', () => messagingService.zenoCreate({ amount: Number(zeno.amount), buyerName: zeno.buyerName.trim(), buyerPhone: phone }), 'zenopay_order_created'); if (r) setZeno((z) => ({ ...z, orderId: r.orderId || r.order_id || r.data?.order_id || '' })); };
  const checkZeno = () => act('zenostatus', () => messagingService.zenoStatus(zeno.orderId), 'check_status');
  const requestSender = () => { if (!sender.name.trim()) { showError(t('required_field', lang)); return; } act('sender', () => messagingService.requestSenderId(sender), 'request_sent').then((r) => { if (r) { setSender(null); load(); } }); };

  const card = (label, value) => <div className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{label}</p><p className="text-lg font-bold text-gray-900 mt-1">{value}</p></div>;
  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('account_and_topup', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('account_and_topup_description', lang)}</p></div><Button variant="secondary" onClick={load} loading={loading}>{t('refresh_balance', lang)}</Button></div>
        {notSetUp && <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800 text-left">{t('sms_not_configured_generic', lang)}</div>}
        {info?.isDeveloper && info.gatewayLabel && <p className="text-xs text-gray-500 text-left">{t('current_sms_gateway', lang)}: <b>{info.gatewayLabel}</b></p>}
        {stats && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{card(t('sms_balance', lang), stats.balance == null ? '—' : `${formatNumberWithCommas(stats.balance)} ${t('sms_unit', lang)}`)}{card(t('total_messages_sent', lang), formatNumberWithCommas(stats.total_messages_sent ?? stats.sent ?? 0))}{card(t('successful_deliveries', lang), formatNumberWithCommas(stats.successful_deliveries ?? stats.delivered ?? 0))}{card(t('failed_messages', lang), formatNumberWithCommas(stats.failed_messages ?? stats.failed ?? 0))}</div>}
        {stats?.balanceError && <p className="text-xs text-red-600 text-left">{t('balance_check_failed_generic', lang)}</p>}
        {stats && stats.statsSource === 'local' && <p className="text-xs text-gray-400 text-left">{t('stats_from_local_log_note_generic', lang)}</p>}

        {manage && info?.configured && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cap.topupUssd && <div className="bg-white rounded shadow p-5 space-y-3 text-left"><h2 className="text-sm font-semibold text-gray-800">{t('topup_via_ussd', lang)}</h2><Input label={t('amount_tzs', lang)} inputMode="numeric" value={ussd.amountTzs} onChange={(e) => setUssd((u) => ({ ...u, amountTzs: e.target.value.replace(/\D/g, '') }))} /><Input label={t('phone_number', lang)} value={ussd.phone} onChange={(e) => setUssd((u) => ({ ...u, phone: e.target.value }))} placeholder="255712345678" /><Button loading={busy === 'ussd'} onClick={payUssd}>{t('send_payment_request', lang)}</Button></div>}
            {cap.topupZenoPay && <div className="bg-white rounded shadow p-5 space-y-3 text-left"><h2 className="text-sm font-semibold text-gray-800">{t('topup_via_zenopay', lang)}</h2><Input label={t('amount_tzs', lang)} inputMode="numeric" value={zeno.amount} onChange={(e) => setZeno((z) => ({ ...z, amount: e.target.value.replace(/\D/g, '') }))} /><Input label={t('full_name', lang)} value={zeno.buyerName} onChange={(e) => setZeno((z) => ({ ...z, buyerName: e.target.value }))} /><Input label={t('phone_number', lang)} value={zeno.buyerPhone} onChange={(e) => setZeno((z) => ({ ...z, buyerPhone: e.target.value }))} placeholder="255712345678" /><div className="flex gap-2"><Button loading={busy === 'zeno'} onClick={payZeno}>{t('send_payment_request', lang)}</Button>{zeno.orderId && <Button variant="secondary" loading={busy === 'zenostatus'} onClick={checkZeno}>{t('check_status', lang)}</Button>}</div></div>}
            {cap.topupRequest && <div className="bg-white rounded shadow p-5 space-y-3 text-left"><h2 className="text-sm font-semibold text-gray-800">{t('request_topup', lang)}</h2><p className="text-xs text-gray-500">{t('request_topup_desc', lang)}</p><Button loading={busy === 'request'} onClick={() => act('request', () => messagingService.topupRequest(), 'request_sent')}>{t('request_topup', lang)}</Button></div>}
          </div>
        )}

        {info?.configured && cap.listSenderIds !== false && (
          <div className="bg-white rounded shadow p-5 text-left space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-800">{t('sender_ids', lang)}</h2>{manage && <Button variant="secondary" onClick={() => setSender({ name: '', description: '', sampleMessage: '' })}>{t('request_sender_id', lang)}</Button>}</div>
            {senders.length === 0 ? <p className="text-sm text-gray-400">{t('ui_nothing_yet', lang)}</p> : <ul className="divide-y divide-gray-100 text-sm">{senders.map((s, i) => <li key={s.id || s.name || i} className="py-1.5 flex justify-between"><span>{s.name || s.sender_name || s}</span><span className="text-gray-500">{s.status || ''}</span></li>)}</ul>}</div>
        )}
      </div>
      <FormModal isOpen={!!sender} onClose={() => busy !== 'sender' && setSender(null)} size="sm" title={t('request_sender_id', lang)}>
        {sender && <form onSubmit={(e) => { e.preventDefault(); requestSender(); }} className="space-y-4 text-left" noValidate><Input label={t('sender_id_name', lang)} required autoFocus maxLength={11} value={sender.name} onChange={(e) => setSender((s) => ({ ...s, name: e.target.value }))} helperText={t('sender_id_hint', lang)} /><Textarea rows={2} label={t('description', lang)} value={sender.description} onChange={(e) => setSender((s) => ({ ...s, description: e.target.value }))} /><Textarea rows={2} label={t('sample_message', lang)} value={sender.sampleMessage} onChange={(e) => setSender((s) => ({ ...s, sampleMessage: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={busy === 'sender'}>{t('request_sender_id', lang)}</Button><Button type="button" variant="secondary" onClick={() => setSender(null)}>{t('cancel', lang)}</Button></div></form>}
      </FormModal>
    </MainLayout>
  );
}
