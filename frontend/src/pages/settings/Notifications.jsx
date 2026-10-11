// FILE PATH: frontend/src/pages/settings/Notifications.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { settingsAdminService } from '../../services/api';
import { Button } from '../../components/ui';
import { t } from '../../utils/i18n';

const CHANNELS = [['inapp', 'in_app'], ['email', 'email'], ['sms', 'sms']];
const labelOf = (event, lang) => { const k = `notify_${event}`; const v = t(k, lang); return v === k ? event.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : v; };

/** For each event (low stock, new sale, payment due…) choose where it is announced: in the app, by email, by SMS. */
export default function Notifications() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [n, setN] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const canManage = can('manage_notifications');
  useEffect(() => { setN(null); settingsAdminService.getNotifications().then(setN).catch((err) => showError(err.message)); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = n ? [...new Set(Object.keys(n).map((k) => k.replace(/^(inapp|email|sms)_/, '')))] : [];
  const save = async () => { try { setSaving(true); const r = await settingsAdminService.updateNotifications(n); window.dispatchEvent(new CustomEvent('biztrack-notification-settings-updated', { detail: n })); showSuccess(r.message || 'settings_updated'); } catch (err) { showError(err.message); } finally { setSaving(false); } };
  const testRun = async (force) => { try { setRunning(true); const r = await settingsAdminService.testRunNotifications(force); showSuccess(r.message || 'notification_test_run_complete'); } catch (err) { showError(err.message); } finally { setRunning(false); } };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('notification_settings', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('notification_settings_desc', lang)}</p></div>{canManage && <Button onClick={save} loading={saving} disabled={!n}>{t('save_changes', lang)}</Button>}</div>
        {!canManage && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('view_only_mode', lang)}</p>}
        {!n && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {n && <p className="text-xs text-gray-500 text-left">{t('notification_channels_note', lang)}</p>}
        {n && <div className="bg-white rounded shadow overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-2 text-left">{t('event', lang)}</th>{CHANNELS.map(([, label]) => <th key={label} className="px-4 py-2 w-24 text-center">{t(label, lang)}</th>)}</tr></thead>
          <tbody>{events.map((ev) => <tr key={ev} className="border-t border-gray-100"><td className="px-4 py-2.5 text-left text-gray-800">{labelOf(ev, lang)}</td>{CHANNELS.map(([ch]) => { const key = `${ch}_${ev}`; return <td key={ch} className="px-4 py-2.5 text-center">{key in n ? <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!!n[key]} disabled={!canManage} onChange={(e) => setN((x) => ({ ...x, [key]: e.target.checked }))} aria-label={key} /> : <span className="text-gray-300">—</span>}</td>; })}</tr>)}</tbody></table></div>}
        {canManage && <div className="bg-white rounded shadow p-5 text-left space-y-2"><h2 className="text-sm font-semibold text-gray-800">{t('test_run_notifications', lang)}</h2><p className="text-xs text-gray-500">{t('test_run_notifications_desc', lang)}</p><div className="flex gap-2"><Button variant="secondary" loading={running} onClick={() => testRun(false)}>{t('run_now', lang)}</Button><Button variant="secondary" loading={running} onClick={() => testRun(true)}>{t('force_test_run', lang)}</Button></div></div>}
      </div>
    </MainLayout>
  );
}
