// FILE PATH: frontend/src/pages/settings/Tools.jsx
import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { toolsService, userAdminService } from '../../services/api';
import { Button, Input, Select, ConfirmModal } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

const saveBlob = (data, name) => { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const when = (v) => (v ? new Date(v).toLocaleString() : '—');
const parse = (d) => { try { return typeof d === 'string' ? JSON.parse(d) : d || {}; } catch { return { note: String(d) }; } };
const ACTIONS = ['login_success', 'login_failed', 'password_changed', 'create_product', 'update_product', 'delete_product', 'create_user', 'update_user', 'remove_user_from_store', 'update_settings', 'database_restore', 'cloud_backup_completed'];

export default function Tools() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [busy, setBusy] = useState(null);
  const [health, setHealth] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ action: '', userId: '', dateFrom: '', dateTo: '' });
  const [logs, setLogs] = useState({ rows: [], total: 0, page: 0, loading: false, loaded: false });
  const [detail, setDetail] = useState(null);
  const [confirmCache, setConfirmCache] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const canUse = can('view_tools');

  useEffect(() => { if (canUse) userAdminService.list({ limit: 100 }).then((r) => setUsers(r.data)).catch(() => {}); }, [currentStore?.id, canUse]);

  const run = async (key, fn, ok) => { try { setBusy(key); await fn(); showSuccess(t(ok, lang)); } catch (err) { showError(err.message); } finally { setBusy(null); } };
  const loadLogs = useCallback(async (page) => {
    try { setLogs((l) => ({ ...l, loading: true })); const r = await toolsService.logs({ ...filters, page, limit: 25 }); setLogs((l) => ({ rows: page === 1 ? r.logs : [...l.rows, ...r.logs], total: r.total, page, loading: false, loaded: true })); }
    catch (err) { showError(err.message); setLogs((l) => ({ ...l, loading: false })); }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = (title, desc, children) => <div className="bg-white rounded shadow p-5 text-left space-y-3"><div><h2 className="text-sm font-semibold text-gray-800">{title}</h2><p className="text-xs text-gray-500 mt-0.5">{desc}</p></div>{children}</div>;
  const d = detail ? parse(detail.description) : null;

  return (
    <MainLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('system_tools', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('system_tools_desc', lang)}</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {card(t('export_data', lang), t('export_data_desc', lang), <Button variant="secondary" loading={busy === 'export'} onClick={() => run('export', async () => saveBlob(await toolsService.exportStoreData(), `${currentStore?.name || 'store'}-data-${today}.sql`), 'export_success_msg')}>{t('export_data', lang)}</Button>)}
          {card(t('backup_database', lang), t('backup_database_desc', lang), <Button variant="secondary" loading={busy === 'backup'} onClick={() => run('backup', async () => saveBlob(await toolsService.backupStoreDatabase(), `${currentStore?.name || 'store'}-backup-${today}.sql`), 'backup_success_msg')}>{t('backup_database', lang)}</Button>)}
          {card(t('db_connection_status', lang), t('db_health_desc', lang), <><Button variant="secondary" loading={busy === 'health'} onClick={() => run('health', async () => setHealth(await toolsService.dbHealth()), 'health_check_passed')}>{t('run_health_check', lang)}</Button>
            {health && <ul className="text-sm divide-y divide-gray-100"><li className="py-1 flex justify-between"><span className="text-gray-500">{t('status', lang)}</span><b className={health.status === 'healthy' ? 'text-green-700' : 'text-red-600'}>{t(health.status === 'healthy' ? 'db_status_healthy' : 'db_status_unhealthy', lang)}</b></li><li className="py-1 flex justify-between"><span className="text-gray-500">{t('response_time', lang)}</span><span>{health.responseMs} ms</span></li><li className="py-1 flex justify-between"><span className="text-gray-500">{t('db_ping', lang)}</span><span>{health.pingMs} ms</span></li><li className="py-1 flex justify-between"><span className="text-gray-500">{t('table_count', lang)}</span><span>{health.tableCount}</span></li><li className="py-1 flex justify-between"><span className="text-gray-500">{t('last_checked', lang)}</span><span>{when(health.checkedAt)}</span></li></ul>}</>)}
          {card(t('clear_cache', lang), t('clear_cache_desc', lang), <Button variant="secondary" loading={busy === 'cache'} onClick={() => setConfirmCache(true)}>{t('clear_cache', lang)}</Button>)}
        </div>

        <div className="bg-white rounded shadow p-5 space-y-3 text-left"><div><h2 className="text-sm font-semibold text-gray-800">{t('activity_logs', lang)}</h2><p className="text-xs text-gray-500">{t('press_filter_to_load_logs', lang)}</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Select label={t('filter_by_action', lang)} value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} options={[{ value: '', label: t('all_actions', lang) }, ...ACTIONS.map((a) => ({ value: a, label: a }))]} />
            <Select searchable label={t('filter_by_user', lang)} value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} options={[{ value: '', label: t('all_users', lang) }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
            <Input type="date" label={t('start_date', lang)} value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /><Input type="date" label={t('end_date', lang)} value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            <div className="flex gap-2"><Button loading={logs.loading && logs.page === 0} onClick={() => loadLogs(1)}>{t('filter', lang)}</Button><Button variant="secondary" onClick={() => { setFilters({ action: '', userId: '', dateFrom: '', dateTo: '' }); setLogs({ rows: [], total: 0, page: 0, loading: false, loaded: false }); }}>{t('clear', lang)}</Button></div></div>
          {logs.loaded && (logs.rows.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">{t('no_data', lang)}</p> : <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('log_time', lang)}</th><th className="px-3 py-2 text-left">{t('log_user', lang)}</th><th className="px-3 py-2 text-left">{t('action', lang)}</th><th className="px-3 py-2 text-left">IP</th><th className="w-16" /></tr></thead>
            <tbody>{logs.rows.map((l) => <tr key={l.id} className="border-t border-gray-100"><td className="px-3 py-2 whitespace-nowrap">{when(l.created_at)}</td><td className="px-3 py-2">{l.user_name || '—'}<span className="block text-[11px] text-gray-400">{l.user_email}</span></td><td className="px-3 py-2">{l.action}</td><td className="px-3 py-2 text-gray-500">{l.ip_address || '—'}</td><td className="px-2"><button type="button" className="text-primary text-xs hover:underline" onClick={() => setDetail(l)}>{t('view', lang)}</button></td></tr>)}</tbody></table></div>)}
          {logs.loaded && logs.rows.length < logs.total && <div className="text-center"><Button variant="secondary" loading={logs.loading} onClick={() => loadLogs(logs.page + 1)}>{t('load_more', lang)} ({logs.rows.length}/{logs.total})</Button></div>}
        </div>
      </div>
      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="md" title={detail?.action}>
        {detail && <div className="space-y-3 text-left text-sm"><p className="text-gray-500">{when(detail.created_at)} · {detail.user_name || '—'}</p>{Object.keys(d).length === 0 ? <p className="text-gray-400">{t('no_changes', lang)}</p> : <ul className="divide-y divide-gray-100 border border-gray-100 rounded">{Object.entries(d).map(([k, v]) => <li key={k} className="px-3 py-1.5 flex justify-between gap-4"><span className="text-gray-500">{k}</span><span className="text-gray-800 break-all text-right">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span></li>)}</ul>}<div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div></div>}
      </FormModal>
      <ConfirmModal isOpen={confirmCache} variant="warning" title={t('clear_cache', lang)} confirmText={t('confirm', lang)} cancelText={t('ui_cancel', lang)} message={t('clear_cache_confirm', lang)} onClose={() => setConfirmCache(false)} onConfirm={() => { setConfirmCache(false); run('cache', () => toolsService.clearCache(), 'cache_cleared_msg'); }} />
    </MainLayout>
  );
}
