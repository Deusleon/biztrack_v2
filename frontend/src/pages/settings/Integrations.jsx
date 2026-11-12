// FILE PATH: frontend/src/pages/settings/Integrations.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { backupService, integrationService } from '../../services/api';
import { Button, Input, Select } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

const size = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (v) => (v ? new Date(v).toLocaleString() : '—');

/** API key, password and sender ID for each SMS provider. Sender ID requests to the network stay on Messaging → Account. */
const GATEWAYS = [
  { provider: 'beem_africa', name: 'Beem Africa', desc: 'send_sms_notifications_via_beem_africa_desc', fields: [
    { key: 'api_key', label: 'api_key', placeholder: 'enter_api_key', secret: true },
    { key: 'secret_key', label: 'secret_key', placeholder: 'enter_secret_key', secret: true },
    { key: 'sender_name', label: 'business_sender_name', placeholder: 'enter_sender_name' },
    { key: 'system_sender_name', label: 'system_sender_name', placeholder: 'enter_sender_name', optional: true, helper: 'system_sender_hint' },
  ] },
  { provider: 'next_sms', name: 'NextSMS', desc: 'send_sms_notifications_via_next_sms_desc', fields: [
    { key: 'username', label: 'username', placeholder: 'enter_username' },
    { key: 'password', label: 'password', placeholder: 'enter_password', secret: true },
    { key: 'sender_name', label: 'business_sender_name', placeholder: 'enter_sender_name' },
    { key: 'system_sender_name', label: 'system_sender_name', placeholder: 'enter_sender_name', optional: true, helper: 'system_sender_hint' },
  ] },
  { provider: 'meseji', name: 'Meseji', desc: 'send_sms_notifications_via_meseji_desc', fields: [
    { key: 'api_key', label: 'api_key', placeholder: 'enter_api_key', secret: true },
    { key: 'sender_id', label: 'business_sender_id', placeholder: 'enter_sender_id' },
    { key: 'system_sender_id', label: 'system_sender_id', placeholder: 'enter_sender_id', optional: true, helper: 'system_sender_hint' },
  ] },
  { provider: 'swala_sms', name: 'SwalaSMS', desc: 'send_sms_notifications_via_swala_sms_desc', fields: [
    { key: 'api_key', label: 'api_key', placeholder: 'enter_api_key', secret: true },
    { key: 'sender_id', label: 'business_sender_id', placeholder: 'enter_sender_id' },
    { key: 'system_sender_id', label: 'system_sender_id', placeholder: 'enter_sender_id', optional: true, helper: 'system_sender_hint' },
  ] },
];

function GatewayCard({ meta, saved, canEdit, lang, onSaved }) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const next = {};
    meta.fields.forEach((f) => { next[f.key] = saved?.[f.key] || ''; });
    setForm(next);
  }, [saved, meta]);
  const required = meta.fields.filter((f) => !f.optional);
  const configured = required.every((f) => saved?.[f.key]);
  const save = async () => {
    if (required.some((f) => !String(form[f.key] || '').trim())) { showError(t('required_field', lang)); return; }
    try {
      setBusy('save');
      const r = await integrationService.save(meta.provider, form);
      showSuccess(r?.message || t('integration_saved', lang));
      onSaved();
    } catch (err) { showError(err.message); } finally { setBusy(null); }
  };
  const test = async () => {
    try {
      setBusy('test');
      const r = await integrationService.verify(meta.provider, form);
      const balance = r?.data?.balance;
      const base = r?.message || t('test_connection', lang);
      showSuccess(balance != null && balance !== '' ? `${base} (${t('balance', lang)}: ${balance})` : base);
    } catch (err) { showError(err.message); } finally { setBusy(null); }
  };
  return (
    <div className="bg-white rounded shadow p-5 text-left space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{meta.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t(meta.desc, lang)}</p>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${configured ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(configured ? 'configured' : 'not_configured', lang)}</span>
      </div>
      {meta.fields.map((f) => (
        <Input key={f.key} label={t(f.label, lang)} type={f.secret ? 'password' : 'text'} value={form[f.key] || ''} autoComplete="off" disabled={!canEdit}
          placeholder={t(f.placeholder, lang)} helperText={f.helper ? t(f.helper, lang) : undefined} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} />
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === 'save'} onClick={save}>{t('save_gateway', lang)}</Button>
          <Button variant="secondary" loading={busy === 'test'} onClick={test}>{busy === 'test' ? t('testing', lang) : t('test_connection', lang)}</Button>
        </div>
      )}
      <p className="text-xs text-gray-400">{t('test_connection_desc', lang)}</p>
    </div>
  );
}

const EMPTY_EMAIL = { smtp_host: '', smtp_port: '587', smtp_secure: false, smtp_username: '', smtp_password: '', from_email: '', from_name: '', system_from_email: '', system_from_name: '', is_active: false };

/** cPanel mailbox used for every email BizTrack sends. Test it before turning it on. */
function EmailGatewayCard({ saved, canEdit, lang, onSaved }) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState(EMPTY_EMAIL);
  const [busy, setBusy] = useState(null);
  const [sendTo, setSendTo] = useState('');
  const [sendAs, setSendAs] = useState('user');
  const [result, setResult] = useState(null);
  useEffect(() => {
    const c = saved?.config || {};
    setForm({
      smtp_host: c.smtp_host || '',
      smtp_port: c.smtp_port ? String(c.smtp_port) : '587',
      smtp_secure: c.smtp_secure === true || c.smtp_secure === 'true',
      smtp_username: c.smtp_username || '',
      smtp_password: '',
      from_email: c.from_email || '',
      from_name: c.from_name || '',
      system_from_email: c.system_from_email || '',
      system_from_name: c.system_from_name || '',
      is_active: !!saved?.is_active,
    });
  }, [saved]);
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setResult(null); };
  const payload = { ...form, smtp_port: Number(form.smtp_port) || 587 };
  const save = async () => {
    if (!form.smtp_host.trim() || !(form.from_email.trim() || form.smtp_username.trim())) { showError(t('required_field', lang)); return; }
    try { setBusy('save'); const r = await integrationService.save('cpanel_smtp', payload); showSuccess(r?.message || t('integration_saved', lang)); setForm((f) => ({ ...f, smtp_password: '' })); onSaved?.(); }
    catch (err) { showError(err.message); } finally { setBusy(null); }
  };
  const run = async (extra) => {
    const key = extra ? 'send' : 'test';
    try {
      setBusy(key); setResult(null);
      const r = await integrationService.verify('cpanel_smtp', payload, extra || {});
      setResult({ ok: true, message: r?.message || t('test_connection', lang) });
    } catch (err) { setResult({ ok: false, message: err.message }); }
    finally { setBusy(null); }
  };
  return (
    <div className="bg-white rounded shadow p-5 text-left space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-gray-800">{t('email_gateway', lang)}</h2><p className="text-xs text-gray-500 mt-0.5">{t('email_gateway_desc', lang)}</p></div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${saved?.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(saved?.is_active ? 'active' : saved ? 'inactive' : 'not_configured', lang)}</span>
      </div>
      <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded p-3">{t('cpanel_email_guide', lang)}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input className="sm:col-span-2" label={t('smtp_host', lang)} value={form.smtp_host} disabled={!canEdit} placeholder="mail.yourdomain.com" onChange={(e) => set({ smtp_host: e.target.value })} />
        <Input label={t('smtp_port', lang)} inputMode="numeric" value={form.smtp_port} disabled={!canEdit} onChange={(e) => set({ smtp_port: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('smtp_username', lang)} value={form.smtp_username} disabled={!canEdit} placeholder="no-reply@yourdomain.com" autoComplete="off" onChange={(e) => set({ smtp_username: e.target.value })} />
        <Input type="password" label={t('smtp_password', lang)} value={form.smtp_password} disabled={!canEdit} placeholder={saved?.config?.smtp_password ? '••••••••' : ''} autoComplete="new-password" onChange={(e) => set({ smtp_password: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('from_email', lang)} type="email" value={form.from_email} disabled={!canEdit} placeholder="no-reply@yourdomain.com" onChange={(e) => set({ from_email: e.target.value })} />
        <Input label={t('from_name', lang)} value={form.from_name} disabled={!canEdit} placeholder="BizTrack" onChange={(e) => set({ from_name: e.target.value })} />
      </div>
      <p className="text-xs text-gray-500">{t('from_email_hint', lang)}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('system_from_email', lang)} type="email" value={form.system_from_email} disabled={!canEdit} onChange={(e) => set({ system_from_email: e.target.value })} />
        <Input label={t('system_from_name', lang)} value={form.system_from_name} disabled={!canEdit} onChange={(e) => set({ system_from_name: e.target.value })} />
      </div>
      <p className="text-xs text-gray-500">{t('system_from_hint', lang)}</p>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={form.smtp_secure} disabled={!canEdit} onChange={(e) => set({ smtp_secure: e.target.checked })} />{t('smtp_secure', lang)}</label>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={form.is_active} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />{t('email_gateway_active', lang)}</label>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === 'save'} onClick={save}>{t('save_email_settings', lang)}</Button>
          <Button variant="secondary" loading={busy === 'test'} disabled={!form.smtp_host.trim()} onClick={() => run()}>{t('test_connection', lang)}</Button>
        </div>
      )}
      {canEdit && (
        <div className="border border-gray-200 rounded p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('send_test_email', lang)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={t('send_to', lang)} type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="you@yourdomain.com" />
            <Select label={t('send_as', lang)} value={sendAs} onChange={(e) => setSendAs(e.target.value)} options={[{ value: 'user', label: t('messages_sender', lang) }, { value: 'system', label: t('system_sender', lang) }]} />
          </div>
          <Button variant="secondary" loading={busy === 'send'} disabled={!form.smtp_host.trim() || !sendTo.trim()} onClick={() => run({ send_to: sendTo.trim(), send_as: sendAs })}>{t('send_test_email', lang)}</Button>
        </div>
      )}
      {result && <p className={`text-sm rounded border px-3 py-2 ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{result.message}</p>}
    </div>
  );
}

/** Google Drive backup: status, history, run now; the developer account also sets the credentials and may restore. */
export default function Integrations() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [configs, setConfigs] = useState({});
  const [emailRow, setEmailRow] = useState(null);
  const [dev, setDev] = useState(false);
  const [form, setForm] = useState({ client_id: '', client_secret: '', refresh_token: '', folder_id: '' });
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(null);
  const [restore, setRestore] = useState(null);       // { kind: 'drive'|'file', id?, name?, file?, typed }
  const fileRef = useRef(null);
  const canManage = can('manage_integration');

  const load = useCallback(async () => {
    try { const [s, h] = await Promise.all([backupService.status(), backupService.list(10)]); setStatus(s); setHistory(h.backups || []); } catch (err) { showError(err.message); }
  }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadIntegrations = useCallback(() => integrationService.list().then((list) => {
    const map = {};
    (list || []).forEach((row) => { map[row.provider] = row.config || {}; });
    setEmailRow((list || []).find((row) => row.provider === 'cpanel_smtp') || null);
    setConfigs(map);
    const c = (list || []).find((i) => i.provider === 'google_drive' || i.provider === 'cloud_backup');
    setConfigured(!!(c?.config?.client_id || c?.is_active));
    if (c?.config) setForm((f) => ({ ...f, client_id: c.config.client_id || '', folder_id: c.config.folder_id || '' }));
  }).catch(() => {}), []);
  useEffect(() => { load(); loadIntegrations(); integrationService.access().then(() => setDev(true)).catch(() => setDev(false)); }, [load, loadIntegrations]);

  // a backup runs in the background: look again every few seconds while the server says it is running
  useEffect(() => { if (!status?.running) return undefined; const id = setInterval(load, 4000); return () => clearInterval(id); }, [status?.running, load]);

  const act = async (key, fn, okKey) => { try { setBusy(key); const r = await fn(); showSuccess(r?.message || t(okKey, lang)); await load(); } catch (err) { showError(err.message); } finally { setBusy(null); } };
  const save = () => {
    if (!form.client_id.trim() || !form.client_secret.trim() || !form.refresh_token.trim()) { showError(t('drive_credentials_required', lang)); return; }
    act('save', () => integrationService.save('google_drive', { client_id: form.client_id.trim(), client_secret: form.client_secret.trim(), refresh_token: form.refresh_token.trim(), folder_id: form.folder_id.trim() }), 'backup_config_saved').then(() => { setConfigured(true); setForm((f) => ({ ...f, client_secret: '', refresh_token: '' })); });
  };
  const confirmRestore = () => {
    if (restore.typed !== 'RESTORE') return;
    const r = restore; setRestore(null);
    act('restore', () => (r.kind === 'drive' ? backupService.restoreFromDrive(r.id) : backupService.restoreFromUpload(r.file)), 'restore_started');
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('integration', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('sms_integrations_desc', lang)}</p></div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 text-left">{t('sms_integrations', lang)}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {GATEWAYS.map((meta) => <GatewayCard key={meta.provider} meta={meta} saved={configs[meta.provider]} canEdit={canManage} lang={lang} onSaved={loadIntegrations} />)}
          </div>
          <p className="text-xs text-gray-500 text-left">
            {t('default_sms_gateway', lang)}: <Link to="/settings/configurations" className="text-primary hover:underline">{t('configuration', lang)}</Link>
            {' · '}
            {t('sender_ids', lang)}: <Link to="/messaging/account" className="text-primary hover:underline">{t('account_and_topup', lang)}</Link>
          </p>
        </div>

        <EmailGatewayCard saved={emailRow} canEdit={canManage} lang={lang} onSaved={loadIntegrations} />

        <div className="bg-white rounded shadow p-5 text-left space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="text-sm font-semibold text-gray-800">{t('google_drive_backup', lang)}</h2><span className={`px-2 py-0.5 rounded text-xs font-medium ${status?.configured ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(status?.configured ? 'configured' : 'not_configured', lang)}</span></div>
          {status && <ul className="text-sm divide-y divide-gray-100"><li className="py-1.5 flex justify-between"><span className="text-gray-500">{t('backup_schedule_info', lang)}</span><span>{status.schedule_time} · {status.timezone}</span></li><li className="py-1.5 flex justify-between"><span className="text-gray-500">{t('backup_retention_info', lang)}</span><span>{status.retention_days} {t('days', lang)}</span></li><li className="py-1.5 flex justify-between"><span className="text-gray-500">{t('last_backup', lang)}</span><span>{status.last_backup ? `${when(status.last_backup.completed_at || status.last_backup.created_at)} · ${size(Number(status.last_backup.size_bytes))}` : '—'}</span></li>{status.running && <li className="py-1.5 text-amber-700">{t('backup_started_msg', lang)}…</li>}</ul>}
          {canManage && <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy === 'test'} onClick={() => act('test', () => backupService.testConnection(), 'drive_connected_as')}>{t('test_connection', lang)}</Button><Button loading={busy === 'run' || status?.running} onClick={() => act('run', () => backupService.runNow(), 'backup_started_msg')}>{t('run_backup_now', lang)}</Button><Button variant="secondary" onClick={load}>{t('refresh', lang)}</Button></div>}
        </div>

        {dev && (
          <div className="bg-white rounded shadow p-5 text-left space-y-3"><h2 className="text-sm font-semibold text-gray-800">{t('drive_credentials', lang)}</h2><p className="text-xs text-gray-500">{t('google_drive_backup_help', lang)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('drive_client_id', lang)} value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} /><Input type="password" label={t('drive_client_secret', lang)} value={form.client_secret} onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))} placeholder={configured ? '••••••••' : ''} autoComplete="off" /><Input type="password" label={t('drive_refresh_token', lang)} value={form.refresh_token} onChange={(e) => setForm((f) => ({ ...f, refresh_token: e.target.value }))} placeholder={configured ? '••••••••' : ''} autoComplete="off" /><Input label={t('drive_folder_id_optional', lang)} value={form.folder_id} onChange={(e) => setForm((f) => ({ ...f, folder_id: e.target.value }))} /></div>
            <Button loading={busy === 'save'} onClick={save}>{t('save_backup_config', lang)}</Button></div>
        )}

        <div className="bg-white rounded shadow p-5 text-left space-y-3"><div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="text-sm font-semibold text-gray-800">{t('backup_history', lang)}</h2>{dev && <><input ref={fileRef} type="file" accept=".gz,.sql,.zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setRestore({ kind: 'file', file: f, name: f.name, typed: '' }); }} /><Button variant="secondary" onClick={() => fileRef.current?.click()}>{t('restore_from_file', lang)}</Button></>}</div>
          {history.length === 0 ? <p className="text-sm text-gray-400 py-3 text-center">{t('no_backups_yet', lang)}</p> : <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('date', lang)}</th><th className="px-3 py-2 text-left">{t('file', lang)}</th><th className="px-3 py-2 text-right">{t('size', lang)}</th><th className="px-3 py-2 text-left">{t('type', lang)}</th><th className="px-3 py-2 text-left">{t('status', lang)}</th>{dev && <th className="w-24" />}</tr></thead>
            <tbody>{history.map((b) => <tr key={b.id} className="border-t border-gray-100"><td className="px-3 py-2 whitespace-nowrap">{when(b.created_at)}</td><td className="px-3 py-2 break-all">{b.file_name}</td><td className="px-3 py-2 text-right">{size(Number(b.size_bytes) || null)}</td><td className="px-3 py-2">{b.triggered_by}</td><td className="px-3 py-2"><span className={b.status === 'success' ? 'text-green-700' : b.status === 'failed' ? 'text-red-600' : 'text-amber-700'}>{b.status}</span>{b.error && <span className="block text-[11px] text-red-500">{b.error}</span>}</td>{dev && <td className="px-2">{b.status === 'success' && b.drive_file_id && <button type="button" className="text-primary text-xs hover:underline" onClick={() => setRestore({ kind: 'drive', id: b.drive_file_id, name: b.file_name, typed: '' })}>{t('restore_database', lang)}</button>}</td>}</tr>)}</tbody></table></div>}
          {!dev && <p className="text-xs text-gray-500">{t('restore_by_admin_only', lang)}</p>}
        </div>
      </div>
      <FormModal isOpen={!!restore} onClose={() => setRestore(null)} size="sm" title={t('restore_database', lang)}>
        {restore && <div className="space-y-4 text-left"><p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{t('restore_warning', lang)}</p><p className="text-sm text-gray-700 break-all">{restore.name}</p><Input label={t('type_restore_to_confirm', lang)} value={restore.typed} onChange={(e) => setRestore((r) => ({ ...r, typed: e.target.value }))} autoFocus /><div className="flex justify-end gap-3"><Button variant="danger" disabled={restore.typed !== 'RESTORE'} onClick={confirmRestore}>{t('restore_database', lang)}</Button><Button variant="secondary" onClick={() => setRestore(null)}>{t('cancel', lang)}</Button></div></div>}
      </FormModal>
    </MainLayout>
  );
}
