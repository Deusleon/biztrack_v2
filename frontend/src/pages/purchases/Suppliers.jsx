// FILE PATH: frontend/src/pages/purchases/Suppliers.jsx
import { useState, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supplierService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, PhoneInput, Textarea, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { Dl } from './common';
import { t } from '../../utils/i18n';

const EMPTY = { name: '', contact_person: '', email: '', phone: '', address: '', city: '', country: '', tin_number: '', vat_number: '', payment_terms: '', notes: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Suppliers() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const list = useServerList({ fetcher: supplierService.getAll });
  useLiveRefresh(['supplierCreated', 'supplierUpdated', 'supplierDeleted'], list.reload);
  const [modal, setModal] = useState({ isOpen: false });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });
  const [view, setView] = useState(null);
  const canCreate = can('create_suppliers'); const canUpdate = can('update_suppliers'); const canDelete = can('delete_suppliers');

  const set = (f) => (e) => { setForm((x) => ({ ...x, [f]: e.target.value })); setErrors((x) => ({ ...x, [f]: undefined })); };
  const openCreate = () => { setForm(EMPTY); setErrors({}); setModal({ isOpen: true, mode: 'create' }); };
  const openEdit = (s) => { setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s[k] || '']))); setErrors({}); setModal({ isOpen: true, mode: 'edit', id: s.id }); };
  const close = () => setModal({ isOpen: false });

  const save = async () => {
    const e = {};
    if (!form.name.trim()) e.name = t('required_field', lang);
    if (form.email && !EMAIL.test(form.email.trim())) e.email = t('invalid_email', lang);
    setErrors(e); if (Object.keys(e).length) return;
    try {
      setSaving(true);
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      const res = modal.mode === 'edit' ? await supplierService.update(modal.id, payload) : await supplierService.create(payload);
      showSuccess(res.message); close(); list.reload();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await supplierService.remove(confirm.id); showSuccess(r.message); list.reload(); } catch (err) { showError(err.message); } setConfirm({ isOpen: false }); };

  const columns = [
    { key: 'name', label: t('supplier_name', lang), render: (s) => <span className="font-medium text-gray-900">{s.name}</span> },
    { key: 'contact_person', label: t('contact_person', lang), render: (s) => s.contact_person || '—' },
    { key: 'phone', label: t('phone', lang), render: (s) => s.phone || '—' },
    { key: 'email', label: t('email', lang), render: (s) => s.email || '—' },
    { key: 'city', label: t('city', lang), render: (s) => s.city || '—' },
    { key: 'payment_terms', label: t('payment_terms', lang), render: (s) => s.payment_terms || '—' },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'name', title: 'supplier_name' }, { key: 'contact_person', title: 'contact_person' }, { key: 'phone', title: 'phone' }, { key: 'email', title: 'email' }, { key: 'city', title: 'city' }, { key: 'tin_number', title: 'tin_number' }];
  const exportRows = useMemo(() => list.rows.map((s, i) => ({ index: `${(list.pagination.currentPage - 1) * list.pagination.limit + i + 1}.`, name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', city: s.city || '', tin_number: s.tin_number || '' })), [list.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasActions = can('view_suppliers') || canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('suppliers', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_suppliers', lang)}</p></div>
          <div className="flex items-center gap-3"><ExportMenu rows={exportRows} columns={exportCols} title="suppliers" disabled={list.loading || list.rows.length === 0} />
            {canCreate && <Button mobileLabel={t('new_supplier', lang)} onClick={openCreate}>{t('new_supplier', lang)}</Button>}</div>
        </div>
        <div className="bg-white p-4 rounded shadow"><Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} aria-label={t('search', lang)} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={hasActions ? (s) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => setView(s) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(s), hidden: !canUpdate },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, id: s.id, name: s.name }), hidden: !canDelete },
          ]} /> : undefined} />
      </div>

      <FormModal isOpen={modal.isOpen} onClose={close} size="lg" title={modal.mode === 'edit' ? t('update_supplier', lang) : t('new_supplier', lang)}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('supplier_name', lang)} required autoFocus value={form.name} onChange={set('name')} error={errors.name} />
            <Input label={t('contact_person', lang)} value={form.contact_person} onChange={set('contact_person')} />
            <PhoneInput label={t('phone', lang)} name="phone" value={form.phone} onChange={set('phone')} helperText=" " />
            <Input type="email" label={t('email', lang)} value={form.email} onChange={set('email')} error={errors.email} />
            <Input label={t('city', lang)} value={form.city} onChange={set('city')} />
            <Input label={t('country', lang)} value={form.country} onChange={set('country')} />
            <Input label={t('tin_number', lang)} value={form.tin_number} onChange={set('tin_number')} />
            <Input label={t('vat_number', lang)} value={form.vat_number} onChange={set('vat_number')} />
            <Input label={t('payment_terms', lang)} value={form.payment_terms} onChange={set('payment_terms')} />
          </div>
          <Textarea label={t('address', lang)} value={form.address} onChange={set('address')} />
          <Textarea label={t('notes', lang)} value={form.notes} onChange={set('notes')} />
          <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{modal.mode === 'edit' ? t('ui_update', lang) : t('save', lang)}</Button><Button type="button" variant="secondary" onClick={close}>{t('ui_cancel', lang)}</Button></div>
        </form>
      </FormModal>

      <FormModal isOpen={!!view} onClose={() => setView(null)} size="md" title={view?.name}>
        {view && <div className="space-y-3"><Dl items={[[t('contact_person', lang), view.contact_person], [t('phone', lang), view.phone], [t('email', lang), view.email], [t('city', lang), [view.city, view.country].filter(Boolean).join(', ')], [t('tin_number', lang), view.tin_number], [t('vat_number', lang), view.vat_number], [t('payment_terms', lang), view.payment_terms], [t('address', lang), view.address]]} />{view.notes && <p className="text-sm text-gray-600 text-left">{view.notes}</p>}</div>}
      </FormModal>
      <ConfirmModal isOpen={confirm.isOpen} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm.name })} onClose={() => setConfirm({ isOpen: false })} onConfirm={remove} />
    </MainLayout>
  );
}
