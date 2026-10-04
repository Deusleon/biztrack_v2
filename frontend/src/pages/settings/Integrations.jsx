// FILE PATH: frontend/src/pages/settings/Integrations.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { backupService, integrationService } from '../../services/api';
import { Button, Input } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

const size = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (v) => (v ? new Date(v).toLocaleString() : '—');

/** Google Drive backup: status, history, run now; the developer account also sets the credentials and may restore. */
export default function Integrations() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
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
  useEffect(() => { load(); integrationService.access().then(() => { setDev(true); return integrationService.list(); }).then((list) => { const c = list.find((i) => i.provider === 'google_drive' || i.provider === 'cloud_backup'); setConfigured(!!(c?.config?.client_id || c?.is_active)); if (c?.config) setForm((f) => ({ ...f, client_id: c.config.client_id || '', folder_id: c.config.folder_id || '' })); }).catch(() => setDev(false)); }, [load]);

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
      <div className="space-y-4 max-w-4xl">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('integration', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('google_drive_backup_desc', lang)}</p></div>
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
