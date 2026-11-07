// FILE PATH: frontend/src/pages/categories/PriceCategories.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { priceCategoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, Textarea, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

const EMPTY = { name: '', description: '' };

/**
 * The server returns ALL of a store's price categories in one go (there are only a handful), so search and paging
 * happen here; every save still reloads the list from the server, like every other page.
 */
const fetchPriceCategories = async ({ search = '', page = 1, limit = 25 }) => {
  const res = await priceCategoryService.getAll();
  const q = search.trim().toLowerCase();
  const all = q ? res.data.filter((c) => `${c.name} ${c.description || ''}`.toLowerCase().includes(q)) : res.data;
  const totalPages = Math.max(1, Math.ceil(all.length / limit));
  return { data: all.slice((page - 1) * limit, page * limit), pagination: { currentPage: Math.min(page, totalPages), totalPages, totalItems: all.length, limit } };
};

export default function PriceCategories() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: fetchPriceCategories });
  useLiveRefresh(['priceCategoryCreated', 'priceCategoryUpdated', 'priceCategoryDeleted'], list.reload);

  const [modal, setModal] = useState({ isOpen: false });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });

  const canCreate = can('create_price_categories');
  const canUpdate = can('update_price_categories');
  const canDelete = can('delete_price_categories');

  const openCreate = () => { setForm(EMPTY); setModal({ isOpen: true, mode: 'create' }); };
  const openEdit = (c) => { setForm({ name: c.name || '', description: c.description || '' }); setModal({ isOpen: true, mode: 'edit', id: c.id }); };
  const close = () => setModal({ isOpen: false });

  const save = async () => {
    if (!form.name.trim()) { showError(t('required_field', lang)); return; }
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), description: form.description.trim() };
      const res = modal.mode === 'edit' ? await priceCategoryService.update(modal.id, payload) : await priceCategoryService.create(payload);
      showSuccess(res.message);
      close();
      list.reload();
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { const res = await priceCategoryService.remove(confirm.id); showSuccess(res.message); list.reload(); }
    catch (err) { showError(err.message); }
    setConfirm({ isOpen: false });
  };

  const columns = [
    { key: 'name', label: t('name', lang), render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'description', label: t('description', lang), render: (r) => r.description || <span className="text-gray-400">{t('n_a', lang)}</span> },
    { key: 'is_active', label: t('status', lang), render: (r) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.is_active ? t('active', lang) : t('inactive', lang)}</span> },
  ];
  const hasActions = canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('price_categories', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_price_categories', lang)}</p>
          </div>
          {canCreate && <Button variant="primary" mobileLabel={t('new_price_category', lang)} onClick={openCreate}>{t('new_price_category', lang)}</Button>}
        </div>

        <div className="bg-white p-4 rounded shadow">
          <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} />
        </div>

        <DataTable
          columns={columns} data={list.rows} loading={list.loading}
          emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)}
          pagination={list.pagination} onPageChange={list.setPage}
          renderActions={hasActions ? (row) => (
            <RowActions actions={[
              { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(row), hidden: !canUpdate },
              { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, id: row.id, name: row.name }), hidden: !canDelete },
            ]} />
          ) : undefined}
        />
      </div>

      <FormModal isOpen={modal.isOpen} onClose={close} size="sm" title={modal.mode === 'edit' ? t('update_price_category', lang) : t('new_price_category', lang)}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
          <Input label={t('category_name', lang)} required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Textarea label={t('description', lang)} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="flex justify-end gap-3 pt-1">
            <Button type="submit" loading={saving}>{modal.mode === 'edit' ? t('ui_update', lang) : t('ui_create', lang)}</Button>
            <Button type="button" variant="secondary" onClick={close}>{t('ui_cancel', lang)}</Button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        isOpen={confirm.isOpen} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)}
        message={t('ui_confirm_delete', lang, { name: confirm.name })} onClose={() => setConfirm({ isOpen: false })} onConfirm={remove}
      />
    </MainLayout>
  );
}
