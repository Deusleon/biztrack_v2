// FILE PATH: frontend/src/pages/stores/Stores.jsx
import { useState, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { storeService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import { Input, DataTable, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

// A person's stores come in one answer; search and paging are done here.
const fetchStores = async ({ search = '', page = 1, limit = 25 }) => {
  const r = await storeService.getMine(); const q = search.trim().toLowerCase();
  const all = q ? r.data.filter((s) => `${s.name} ${s.store_code} ${s.location || ''}`.toLowerCase().includes(q)) : r.data;
  const pages = Math.max(1, Math.ceil(all.length / limit));
  return { data: all.slice((page - 1) * limit, page * limit), pagination: { currentPage: Math.min(page, pages), totalPages: pages, totalItems: all.length, limit } };
};

export default function Stores() {
  const { can, user } = useAuth();
  const { currentStore, refreshStores } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: fetchStores });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', store_code: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);               // { store, password }
  const canCreate = can('create_stores'); const canEdit = can('edit_stores'); const canDelete = can('delete_stores');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const refreshAll = async () => { list.reload(); await refreshStores(); };

  const save = async () => {
    if (!form.name.trim() || !form.store_code.trim()) { showError(t('all_fields_required', lang)); return; }
    try { setSaving(true); const body = { name: form.name.trim(), store_code: form.store_code.trim(), location: form.location.trim() }; const r = modal.id ? await storeService.update(modal.id, body) : await storeService.create(body); showSuccess(r.message); setModal(null); await refreshAll(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!del.password) { showError(t('password_required', lang)); return; }
    try { setSaving(true); const r = await storeService.remove(del.store.id, del.password); showSuccess(r.message); setDel(null); await refreshAll(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const mine = (s) => s.owner_id === user?.id;
  const columns = [
    { key: 'name', label: t('store_name', lang), render: (s) => <span className="font-medium text-gray-900">{s.name}{s.id === currentStore?.id && <span className="ml-2 text-xs text-primary">● {t('current', lang)}</span>}</span> },
    { key: 'store_code', label: t('store_code', lang) },
    { key: 'location', label: t('location', lang), render: (s) => s.location || <span className="text-gray-400">{t('not_specified', lang)}</span> },
  ];
  const exportRows = useMemo(() => list.rows.map((s, i) => ({ index: `${i + 1}.`, name: s.name, store_code: s.store_code, location: s.location || '' })), [list.rows]);
  const hasActions = canEdit || canDelete;
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('stores_management', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_system_stores', lang)}</p></div>
          <div className="flex items-center gap-3"><ExportMenu rows={exportRows} columns={[{ key: 'index', title: 'no.', width: '45px' }, { key: 'name', title: 'store_name' }, { key: 'store_code', title: 'store_code' }, { key: 'location', title: 'location' }]} title="stores" disabled={list.loading || exportRows.length === 0} />{canCreate && <Button onClick={() => { setForm({ name: '', store_code: '', location: '' }); setModal({}); }} mobileLabel={t('new_store', lang)}>{t('new_store', lang)}</Button>}</div>
        </div>
        <div className="bg-white p-4 rounded shadow"><Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={hasActions ? (s) => <RowActions actions={[
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => { setForm({ name: s.name, store_code: s.store_code, location: s.location || '' }); setModal({ id: s.id }); }, hidden: !canEdit || !mine(s) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setDel({ store: s, password: '' }), hidden: !canDelete || !mine(s) },
          ]} /> : undefined} />
      </div>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="sm" title={modal?.id ? t('edit_store', lang) : t('add_store', lang)}>
        {modal && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4"><Input label={t('store_name', lang)} required autoFocus value={form.name} onChange={set('name')} /><Input label={t('store_code', lang)} required value={form.store_code} onChange={set('store_code')} /><Input label={t('location', lang)} value={form.location} onChange={set('location')} /><div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{modal.id ? t('ui_update', lang) : t('ui_create', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
      <FormModal isOpen={!!del} onClose={() => !saving && setDel(null)} size="sm" title={t('delete_store', lang)}>
        {del && <form onSubmit={(e) => { e.preventDefault(); remove(); }} className="space-y-4 text-left"><p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{t('delete_store_warning', lang, { name: del.store.name })}</p><Input type="password" label={t('enter_password_to_confirm', lang)} required autoFocus autoComplete="current-password" value={del.password} onChange={(e) => setDel((d) => ({ ...d, password: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" variant="danger" loading={saving}>{t('delete', lang)}</Button><Button type="button" variant="secondary" onClick={() => setDel(null)}>{t('ui_cancel', lang)}</Button></div></form>}
      </FormModal>
    </MainLayout>
  );
}
