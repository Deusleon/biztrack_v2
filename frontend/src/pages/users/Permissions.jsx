// FILE PATH: frontend/src/pages/users/Permissions.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { roleService, permissionService } from '../../services/api';
import { Input, Select } from '../../components/ui';
import { t } from '../../utils/i18n';

/** Pick a role, then switch each permission (or a whole module / group) on or off. Every switch is saved at once. */
export default function Permissions() {
  const { can } = useAuth();
  const { showError, showSuccess } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState('');
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const canEdit = can('manage_permissions');

  useEffect(() => { roleService.getAll().then((r) => { setRoles(r.data); setRoleId((x) => (r.data.some((y) => y.id === x) ? x : r.data[0]?.id || '')); }).catch(() => showError(t('roles_not_found', lang))); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async (quiet) => {
    if (!roleId) return;
    try { if (!quiet) setLoading(true); setMatrix((await permissionService.get(roleId)).data); }
    catch (err) { showError(err.message); } finally { setLoading(false); }
  }, [roleId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [load]);

  const change = async (key, fn) => { try { setBusy(key); await fn(); await load(true); } catch (err) { showError(err.message); await load(true); } finally { setBusy(null); } };
  const toggle = (p) => change(p.id, () => permissionService.set({ roleId, permissionId: p.id, isAllowed: !p.is_allowed }));
  const bulk = (module, submodule, isAllowed) => change(`${module}/${submodule || ''}`, async () => { const r = await permissionService.setMany({ roleId, module, submodule, isAllowed }); showSuccess(r.message); });

  const phrase = (text) => { const key = String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return key ? t(key, lang) : text; };
  const q = search.trim().toLowerCase();
  const view = useMemo(() => Object.entries(matrix).map(([module, subs]) => [module, Object.entries(subs).map(([sub, perms]) => [sub, perms.filter((p) => !q || `${p.name} ${p.description} ${t(p.name, lang)}`.toLowerCase().includes(q))]).filter(([, perms]) => perms.length)]).filter(([, subs]) => subs.length), [matrix, q, lang]);
  const role = roles.find((r) => r.id === roleId);

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('permissions_management', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_user_roles_and_permissions', lang)}</p></div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Select label={t('select_role', lang)} value={roleId} onChange={(e) => setRoleId(e.target.value)} options={roles.map((r) => ({ value: r.id, label: r.name }))} /><Input label={t('search', lang)} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search_here', lang)} /></div>
        {!canEdit && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('permissions_read_only', lang)}</p>}
        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && view.length === 0 && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('no_data', lang)}</div>}
        {!loading && view.map(([module, subs]) => (
          <div key={module} className="bg-white rounded shadow">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-800">{phrase(module)}</h2>
              {canEdit && <div className="flex gap-3 text-xs"><button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => bulk(module, undefined, true)}>{t('allow_all', lang)}</button><button type="button" className="text-gray-500 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => bulk(module, undefined, false)}>{t('deny_all', lang)}</button></div>}</div>
            <div className="p-5 space-y-4">{subs.map(([sub, perms]) => (
              <div key={sub}>
                <div className="flex items-center justify-between mb-1.5"><h3 className="text-xs uppercase tracking-wide text-gray-400 text-left">{phrase(sub)}</h3>
                  {canEdit && <div className="flex gap-3 text-[11px]"><button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => bulk(module, sub, true)}>{t('allow_all', lang)}</button><button type="button" className="text-gray-500 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => bulk(module, sub, false)}>{t('deny_all', lang)}</button></div>}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-gray-300">{[perms.slice(0, Math.ceil(perms.length / 2)), perms.slice(Math.ceil(perms.length / 2))].filter((col) => col.length).map((col, i) => (
                  <ul key={i} className={i === 0 ? 'md:pr-10' : 'md:pl-10'}>{col.map((p) => (
                  <li key={p.id}><label className={`flex items-center justify-between gap-3 py-1.5 text-sm ${canEdit ? 'cursor-pointer' : ''}`}><span className="text-gray-700 text-left">{t(p.name, lang)}</span>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!!p.is_allowed} disabled={!canEdit || busy === p.id} onChange={() => toggle(p)} aria-label={t(p.name, lang)} /></label></li>))}</ul>))}</div>
              </div>))}</div>
          </div>
        ))}
        {role && <p className="text-xs text-gray-400 text-left">{t('permissions_apply_note', lang, { role: role.name })}</p>}
      </div>
    </MainLayout>
  );
}
