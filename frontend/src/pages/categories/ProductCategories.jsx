// FILE PATH: frontend/src/pages/categories/ProductCategories.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { categoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, Textarea, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

const EMPTY = { name: '', description: '' };

export default function ProductCategories() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: categoryService.getAll });
  useLiveRefresh(['categoryCreated', 'categoryUpdated', 'categoryDeleted'], list.reload);

  const [modal, setModal] = useState({ isOpen: false });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });

  const canCreate = can('create_product_categories');
  const canUpdate = can('update_product_categories');
  const canDelete = can('delete_product_categories');

  const openCreate = () => { setForm(EMPTY); setModal({ isOpen: true, mode: 'create' }); };
  const openEdit = (c) => { setForm({ name: c.name || '', description: c.description || '' }); setModal({ isOpen: true, mode: 'edit', id: c.id }); };
  const close = () => setModal({ isOpen: false });

  const save = async () => {
    if (!form.name.trim()) { showError(t('required_field', lang)); return; }
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), description: form.description.trim() };
      const res = modal.mode === 'edit' ? await categoryService.update(modal.id, payload) : await categoryService.create(payload);
      showSuccess(res.message);
      close();
      list.reload();
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      const res = await categoryService.remove(confirm.id);
      showSuccess(res.message);
      list.reload();
    } catch (err) { showError(err.message); }
    setConfirm({ isOpen: false });
  };

  const columns = [
    { key: 'name', label: t('name', lang), render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'description', label: t('description', lang), render: (r) => r.description || <span className="text-gray-400">{t('n_a', lang)}</span> },
  ];

  const hasActions = canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('product_categories', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_product_categories', lang)}</p>
          </div>
          {canCreate && <Button variant="primary" mobileLabel={t('new_category', lang)} onClick={openCreate}>{t('new_category', lang)}</Button>}
        </div>

        <div className="bg-white p-4 rounded shadow">
          <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} />
        </div>

        <DataTable
          columns={columns}
          data={list.rows}
          loading={list.loading}
          emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)}
          pagination={list.pagination}
          onPageChange={list.setPage}
          renderActions={hasActions ? (row) => (
            <RowActions actions={[
              { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(row), hidden: !canUpdate },
              { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, id: row.id, name: row.name }), hidden: !canDelete },
            ]} />
          ) : undefined}
        />
      </div>

      <FormModal isOpen={modal.isOpen} onClose={close} size="md" title={modal.mode === 'edit' ? t('update_category', lang) : t('new_category', lang)}>
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
