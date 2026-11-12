// FILE PATH: frontend/src/pages/users/Users.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { roleService, userAdminService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, Select, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { dateOnly, DetailGrid } from '../sales/common';
import { t } from '../../utils/i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Users() {
  const { can, user: me } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: userAdminService.list });
  useLiveRefresh(['userCreated', 'userUpdated', 'userDeleted'], list.reload);
  const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(null);           // { id? } id = the person's user id
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: '', status: true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [view, setView] = useState(null);
  const canEdit = can('edit_users'); const canDelete = can('delete_users') || canEdit;
  useEffect(() => { roleService.getAll().then((r) => setRoles(r.data)).catch(() => showError(t('failed_to_fetch_roles', lang))); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const openCreate = () => { setForm({ full_name: '', email: '', password: '', role: roles[0]?.name || '', status: true }); setErrors({}); setModal({}); };
  const openEdit = (u) => { setForm({ full_name: u.name, email: u.email, password: '', role: u.storeInfo?.role_id || '', status: !!u.status }); setErrors({}); setModal({ id: u.id }); };
  const save = async () => {
    const e = {};
    if (!modal.id) {
      if (form.full_name.trim().length < 2) e.full_name = t('full_name_required', lang);
      if (!EMAIL.test(form.email.trim())) e.email = t('invalid_email', lang);
      if (form.password.length < 8) e.password = t('password_min_8_chars', lang);
    }
    if (!form.role) e.role = t('role_required', lang);
    setErrors(e); if (Object.keys(e).length) return;
    try {
      setSaving(true);
      const r = modal.id ? await userAdminService.update(modal.id, { role: form.role, status: form.status }) : await userAdminService.create({ full_name: form.full_name.trim(), email: form.email.trim(), password: form.password, role: form.role, status: form.status });
      showSuccess(r.message); setModal(null); list.reload();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await userAdminService.remove(confirm.id); showSuccess(r.message); list.reload(); } catch (err) { showError(err.message); } setConfirm(null); };

  const columns = [
    { key: 'name', label: t('full_name', lang), render: (u) => <span className="font-medium text-gray-900">{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-gray-400">({t('you', lang)})</span>}</span> },
    { key: 'email', label: t('email', lang) },
    { key: 'role', label: t('role', lang), render: (u) => u.storeInfo?.role_name || '—' },
    { key: 'status', label: t('status', lang), render: (u) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.status ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(u.status ? 'enabled' : 'disabled', lang)}</span> },
    { key: 'created_at', label: t('date', lang), render: (u) => dateOnly(u.created_at) },
  ];
  const exportRows = useMemo(() => list.rows.map((u, i) => ({ index: `${i + 1}.`, name: u.name, email: u.email, role: u.storeInfo?.role_name || '', status: t(u.status ? 'enabled' : 'disabled', lang) })), [list.rows, lang]);

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('users_management', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_system_users', lang)}</p></div>
          <div className="flex items-center gap-3">{can('export_users_pdf') && <ExportMenu rows={exportRows} columns={[{ key: 'index', title: 'no.', width: '45px' }, { key: 'name', title: 'full_name' }, { key: 'email', title: 'email' }, { key: 'role', title: 'role' }, { key: 'status', title: 'status' }]} title="users" disabled={list.loading || exportRows.length === 0} />}{canEdit && <Button onClick={openCreate} mobileLabel={t('add_user', lang)}>{t('add_user', lang)}</Button>}</div>
        </div>
        <div className="bg-white p-4 rounded shadow"><Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(u) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => setView(u) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(u), hidden: !canEdit || u.id === me?.id },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: u.id, name: u.name }), hidden: !canDelete || u.id === me?.id },
          ]} />} />
      </div>
      <FormModal isOpen={!!view} onClose={() => setView(null)} size="xl" title={view?.name || t('user', lang)}>
        {view && (
          <div className="space-y-4">
            <DetailGrid items={[
              [t('full_name', lang), view.name],
              [t('email', lang), view.email],
              [t('role', lang), view.storeInfo?.role_name],
              [t('store', lang), view.storeInfo?.store_name],
              [t('account_status', lang), t(view.status ? 'enabled' : 'disabled', lang)],
              [t('default_language', lang), view.preferred_language],
              [t('date', lang), dateOnly(view.created_at)],
            ]} />
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setView(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="lg" title={modal?.id ? t('edit_user', lang) : t('add_user', lang)}>
        {modal && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            {!modal.id && <><Input label={t('full_name', lang)} required autoFocus value={form.full_name} onChange={set('full_name')} error={errors.full_name} /><Input type="email" label={t('email', lang)} required value={form.email} onChange={set('email')} error={errors.email} /><Input type="password" label={t('password', lang)} required autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} helperText={t('min_8_characters', lang)} /></>}
            {modal.id && <p className="text-sm text-gray-600 text-left">{form.full_name} · {form.email}</p>}
            <Select label={t('role', lang)} required value={form.role} onChange={set('role')} error={errors.role} placeholder={t('select_role', lang)} options={roles.map((r) => ({ value: modal.id ? r.id : r.name, label: r.name }))} />
            <Select label={t('account_status', lang)} value={form.status ? 'on' : 'off'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value === 'on' }))} options={[{ value: 'on', label: t('enabled', lang) }, { value: 'off', label: t('disabled', lang) }]} />
            <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{modal.id ? t('ui_update', lang) : t('ui_create', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
