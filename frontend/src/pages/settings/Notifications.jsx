// FILE PATH: frontend/src/pages/settings/Notifications.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { aiService, settingsAdminService } from '../../services/api';
import { Button, Loader } from '../../components/ui';
import { t } from '../../utils/i18n';

const CHANNELS = [['inapp', 'in_app'], ['email', 'email'], ['sms', 'sms']];

/** One event, then who receives it. Party ids match the saved notification keys. */
const COLUMNS = [
  [
    { event: 'new_sale', parties: [{ id: 'new_sale', where: 'store' }, { id: 'new_sale_customer', where: 'customer' }] },
    { event: 'order_payment', parties: [{ id: 'order_payment', where: 'store' }, { id: 'order_payment_customer', where: 'customer' }] },
    { event: 'debit_paid', parties: [{ id: 'debit_paid', where: 'store' }, { id: 'debit_paid_customer', where: 'customer' }] },
    { event: 'payment_due', parties: [{ id: 'payment_due', where: 'store' }, { id: 'payment_due_customer', where: 'customer', hint: 'notify_payment_due_customer_hint' }] },
    { event: 'sales_return', parties: [{ id: 'sales_return', where: 'store' }, { id: 'sales_return_customer', where: 'customer' }] },
    { event: 'daily_summary', parties: [{ id: 'daily_summary', where: 'owner' }] },
    { event: 'low_stock', parties: [{ id: 'low_stock', where: 'store' }] },
  ],
  [
    { event: 'purchase_received', parties: [{ id: 'purchase_received', where: 'store' }, { id: 'purchase_received_supplier', where: 'supplier' }] },
    { event: 'supplier_payment', parties: [{ id: 'supplier_payment', where: 'store' }, { id: 'supplier_payment_supplier', where: 'supplier' }] },
    { event: 'stock_transfer', parties: [{ id: 'stock_transfer', where: 'store' }, { id: 'stock_transfer_store', where: 'other_store' }] },
    { event: 'stock_adjustment', parties: [{ id: 'stock_adjustment', where: 'store' }] },
    { event: 'new_user', parties: [{ id: 'new_user', where: 'store' }, { id: 'new_user_user', where: 'the_new_user' }] },
    { event: 'user_activity', parties: [{ id: 'user_activity', where: 'store' }] },
    { event: 'cloud_backup', parties: [{ id: 'cloud_backup', where: 'store' }] },
    { event: 'subscription_expiring', parties: [{ id: 'subscription_expiring', where: 'store' }] },
  ],
];

const WHERE_KEY = {
  store: 'store',
  customer: 'customer',
  supplier: 'supplier',
  other_store: 'other_store',
  the_new_user: 'the_new_user',
  owner: 'owner',
};

const labelOf = (event, lang) => {
  const key = `notify_${event}`;
  const value = t(key, lang);
  return value === key ? event.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : value;
};

function partyVisible(party, settings) {
  return CHANNELS.some(([channel]) => `${channel}_${party.id}` in settings);
}

function columnsFor(settings) {
  const known = new Set(COLUMNS.flat().flatMap((group) => group.parties.map((party) => party.id)));
  const columns = COLUMNS.map((groups) => groups
    .map((group) => ({ ...group, parties: group.parties.filter((party) => partyVisible(party, settings)) }))
    .filter((group) => group.parties.length));

  const extra = [...new Set(Object.keys(settings)
    .filter((key) => /^(inapp|email|sms)_/.test(key))
    .map((key) => key.replace(/^(inapp|email|sms)_/, '')))]
    .filter((id) => !known.has(id))
    .map((id) => ({ event: id, parties: [{ id, where: 'store' }] }));
  if (extra.length) columns[columns.length - 1].push(...extra);
  return columns;
}

function ChannelBox({ settings, channel, partyId, canManage, onChange, label }) {
  const key = `${channel}_${partyId}`;
  if (!(key in settings)) return <span className="text-gray-300">—</span>;
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-[var(--color-primary)]"
      checked={!!settings[key]}
      disabled={!canManage}
      onChange={(e) => onChange(key, e.target.checked)}
      aria-label={label}
    />
  );
}

function EventTable({ groups, settings, canManage, onChange, lang }) {
  return (
    <div className="bg-white rounded shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t('event', lang)}</th>
            <th className="px-3 py-2 text-left font-medium">{t('where_to', lang)}</th>
            {CHANNELS.map(([, label]) => (
              <th key={label} className="px-2 py-2 w-16 text-center font-medium">{t(label, lang)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIndex) => group.parties.map((party, index) => {
            const eventLabel = labelOf(group.event, lang);
            const whereLabel = t(WHERE_KEY[party.where] || party.where, lang);
            return (
              <tr key={party.id} className={index === 0 && groupIndex > 0 ? 'border-t-2 border-gray-200' : 'border-t border-gray-100'}>
                {index === 0 && (
                  <td rowSpan={group.parties.length} className="px-3 py-2 align-top font-medium text-gray-900">
                    {eventLabel}
                  </td>
                )}
                <td className="px-3 py-2 text-left text-gray-700">
                  {whereLabel}
                  {party.hint && <div className="text-[11px] leading-tight text-gray-400">{t(party.hint, lang)}</div>}
                </td>
                {CHANNELS.map(([channel, channelLabel]) => (
                  <td key={channel} className="px-2 py-2 text-center">
                    <ChannelBox
                      settings={settings}
                      channel={channel}
                      partyId={party.id}
                      canManage={canManage}
                      onChange={onChange}
                      label={`${eventLabel}, ${whereLabel}, ${t(channelLabel, lang)}`}
                    />
                  </td>
                ))}
              </tr>
            );
          }))}
        </tbody>
      </table>
    </div>
  );
}

/** For each event, choose who hears about it and by which channel. */
export default function Notifications() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [n, setN] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [delivery, setDelivery] = useState({ bell: false, email: false, sms: false });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const canManage = can('manage_notifications');
  const canBrief = can('ai_access');

  useEffect(() => {
    setN(null);
    settingsAdminService.getNotifications().then(setN).catch((err) => showError(err.message));
    if (can('ai_access')) aiService.briefDelivery().then(setDelivery).catch(() => {});
  }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      setSaving(true);
      const r = await settingsAdminService.updateNotifications(n);
      window.dispatchEvent(new CustomEvent('biztrack-notification-settings-updated', { detail: n }));
      showSuccess(r.message || 'settings_updated');
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testRun = async (force) => {
    try {
      setRunning(true);
      const r = await settingsAdminService.testRunNotifications(force);
      showSuccess(r.message || 'notification_test_run_complete');
    } catch (err) {
      showError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const columns = n ? columnsFor(n) : [];
  const toggleDelivery = async (key) => {
    const next = { ...delivery, [key]: !delivery[key] };
    setDelivery(next);
    setSavingDelivery(true);
    try { setDelivery(await aiService.saveBriefDelivery(next)); }
    catch (err) { showError(err.message); }
    finally { setSavingDelivery(false); }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('notification_settings', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('notification_settings_desc', lang)}</p>
          </div>
          {canManage && <Button onClick={save} loading={saving} disabled={!n}>{t('save_changes', lang)}</Button>}
        </div>
        {!canManage && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('view_only_mode', lang)}</p>}
        {!n && <Loader />}
        {n && (
          <div className="bg-white rounded shadow p-5 text-left space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{t('ai_daily_brief', lang)}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('ai_daily_brief_setting_desc', lang)}</p>
            </div>
            <label className="flex items-center justify-between gap-3 py-2 border-t border-gray-100 text-sm text-gray-800 cursor-pointer">
              <span>{t('ai_daily_brief_setting', lang)}</span>
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={n.show_daily_brief !== false} disabled={!canManage} onChange={(e) => setN((current) => ({ ...current, show_daily_brief: e.target.checked }))} />
            </label>
            {canBrief && (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs text-gray-500">{t('ai_brief_delivery_hint', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  {['bell', 'email', 'sms'].map((key) => (
                    <button key={key} type="button" disabled={savingDelivery} onClick={() => toggleDelivery(key)} className={`px-2.5 py-1 text-xs font-medium rounded border ${delivery[key] ? 'border-primary bg-primary-10 text-primary' : 'border-gray-300 text-gray-600'}`}>{t(`ai_brief_${key}`, lang)}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {n && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {columns.map((groups, index) => (
              <EventTable
                key={index}
                groups={groups}
                settings={n}
                canManage={canManage}
                lang={lang}
                onChange={(key, value) => setN((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>
        )}
        {/* {canManage && (
          <div className="bg-white rounded shadow p-5 text-left space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">{t('test_run_notifications', lang)}</h2>
            <p className="text-xs text-gray-500">{t('test_run_notifications_desc', lang)}</p>
            <div className="flex gap-2">
              <Button variant="secondary" loading={running} onClick={() => testRun(false)}>{t('run_now', lang)}</Button>
              <Button variant="secondary" loading={running} onClick={() => testRun(true)}>{t('force_test_run', lang)}</Button>
            </div>
          </div>
        )} */}
      </div>
    </MainLayout>
  );
}
