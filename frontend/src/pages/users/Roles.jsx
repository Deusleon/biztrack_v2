// FILE PATH: frontend/src/pages/users/Roles.jsx
import { useState, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { roleService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, Textarea, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

// The server sends every role at once (a handful per store): search and paging are done here.
const fetchRoles = async ({ search = '', page = 1, limit = 25 }) => {
  const r = await roleService.getAll(); const q = search.trim().toLowerCase();
  const all = q ? r.data.filter((x) => `${x.name} ${x.description || ''}`.toLowerCase().includes(q)) : r.data;
  const pages = Math.max(1, Math.ceil(all.length / limit));
  return { data: all.slice((page - 1) * limit, page * limit), pagination: { currentPage: Math.min(page, pages), totalPages: pages, totalItems: all.length, limit } };
};

export default function Roles() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: fetchRoles });
  useLiveRefresh(['roleCreated', 'roleUpdated', 'roleDeleted'], list.reload);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const canCreate = can('create_roles'); const canEdit = can('edit_roles'); const canDelete = can('delete_roles');

  const save = async () => {
    if (!form.name.trim()) { showError(t('required_field', lang)); return; }
    try { setSaving(true); const body = { name: form.name.trim(), description: form.description.trim() }; const r = modal.id ? await roleService.update(modal.id, body) : await roleService.create(body); showSuccess(r.message); setModal(null); list.reload(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await roleService.remove(confirm.id); showSuccess(r.message); list.reload(); } catch (err) { showError(err.message); } setConfirm(null); };

  const columns = [
    { key: 'name', label: t('role_name', lang), render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'description', label: t('description', lang), render: (r) => r.description || <span className="text-gray-400">{t('n_a', lang)}</span> },
    { key: 'user_count', label: t('users', lang), align: 'right', render: (r) => Number(r.user_count) || 0 },
  ];
  const exportRows = useMemo(() => list.rows.map((r, i) => ({ index: `${i + 1}.`, name: r.name, description: r.description || '', user_count: String(Number(r.user_count) || 0) })), [list.rows]);
  const hasActions = canEdit || canDelete;
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('roles_management', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_system_roles', lang)}</p></div>
          <div className="flex items-center gap-3">{can('export_roles_pdf') && <ExportMenu rows={exportRows} columns={[{ key: 'index', title: 'no.', width: '45px' }, { key: 'name', title: 'role_name' }, { key: 'description', title: 'description' }, { key: 'user_count', title: 'users' }]} title="roles" disabled={list.loading || exportRows.length === 0} />}{canCreate && <Button onClick={() => { setForm({ name: '', description: '' }); setModal({}); }} mobileLabel={t('new_role', lang)}>{t('new_role', lang)}</Button>}</div>
        </div>
        <div className="bg-white p-4 rounded shadow"><Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={hasActions ? (r) => <RowActions actions={[
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => { setForm({ name: r.name, description: r.description || '' }); setModal({ id: r.id }); }, hidden: !canEdit },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: r.id, name: r.name }), hidden: !canDelete || Number(r.user_count) > 0 },
          ]} /> : undefined} />
      </div>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="sm" title={modal?.id ? t('update_role', lang) : t('new_role', lang)}>
        {modal && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4"><Input label={t('role_name', lang)} required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><Textarea label={t('description', lang)} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /><p className="text-xs text-gray-500 text-left">{t('role_permissions_help', lang)}</p><div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{modal.id ? t('ui_update', lang) : t('ui_create', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
