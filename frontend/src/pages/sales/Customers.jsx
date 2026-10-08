// FILE PATH: frontend/src/pages/sales/Customers.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { customerService, priceCategoryService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Input, PhoneInput, NumberInput, Textarea, Select, DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { DetailGrid } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const EMPTY = { name: '', phone: '', email: '', customer_type: '', credit_limit: '', credit_due_days: '', address: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Customers() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const list = useServerList({ fetcher: customerService.getAll });
  useLiveRefresh(['customerCreated', 'customerUpdated', 'customerDeleted'], list.reload);

  const [types, setTypes] = useState([]);
  const [modal, setModal] = useState({ isOpen: false });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });
  const [view, setView] = useState(null);

  const canCreate = can('create_customers');
  const canUpdate = can('update_customers');
  const canDelete = can('delete_customers');

  // Customer types are the store's price categories.
  useEffect(() => {
    priceCategoryService.getAll({ limit: 100 }).then((res) => setTypes(res.data)).catch(() => setTypes([]));
  }, [currentStore?.id]);
  const typeName = (id) => types.find((x) => x.id === id)?.name || '';
  const money = (v) => formatCurrency(Number(v) || 0, settings);

  const openCreate = () => { setForm({ ...EMPTY, customer_type: types.find((x) => x.is_default)?.id || types[0]?.id || '' }); setErrors({}); setModal({ isOpen: true, mode: 'create' }); };
  const openEdit = (c) => {
    setForm({
      name: c.name || '', phone: c.phone || '', email: c.email || '', customer_type: c.customer_type || '',
      credit_limit: c.credit_limit ? String(Number(c.credit_limit)) : '', credit_due_days: c.credit_due_days ? String(Math.floor(Number(c.credit_due_days))) : '', address: c.address || '',
    });
    setErrors({}); setModal({ isOpen: true, mode: 'edit', id: c.id });
  };
  const close = () => setModal({ isOpen: false });
  const set = (f) => (e) => { setForm((x) => ({ ...x, [f]: e.target.value })); setErrors((x) => ({ ...x, [f]: undefined })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('required_field', lang);
    if (form.email && !EMAIL.test(form.email.trim())) e.email = t('invalid_email', lang);
    if (form.phone && form.phone.replace(/\D/g, '').length > 3 && form.phone.length > 12) e.phone = t('phone_too_long', lang);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(), phone: form.phone || null, email: form.email.trim() || null, address: form.address.trim() || null,
        customer_type: form.customer_type || null,
        credit_limit: Number(form.credit_limit) || 0, credit_due_days: parseInt(form.credit_due_days, 10) || 0,
      };
      const res = modal.mode === 'edit' ? await customerService.update(modal.id, payload) : await customerService.create(payload);
      showSuccess(res.message);
      close();
      list.reload();
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { const res = await customerService.remove(confirm.id); showSuccess(res.message); list.reload(); }
    catch (err) { showError(err.message); }
    setConfirm({ isOpen: false });
  };

  const columns = [
    { key: 'name', label: t('customer_name', lang), render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'phone', label: t('phone', lang), render: (r) => r.phone || <span className="text-gray-400">—</span> },
    { key: 'email', label: t('email', lang), render: (r) => r.email || <span className="text-gray-400">—</span> },
    { key: 'customer_type', label: t('customer_type', lang), render: (r) => typeName(r.customer_type) || <span className="text-gray-400">—</span> },
    { key: 'credit_limit', label: t('credit_limit', lang), align: 'right', render: (r) => money(r.credit_limit) },
    { key: 'current_balance', label: t('current_balance', lang), align: 'right', render: (r) => <span className={Number(r.current_balance) > 0 ? 'text-red-600 font-medium' : ''}>{money(r.current_balance)}</span> },
  ];

  // What the exports print: the same columns, as text, with the money already formatted.
  const exportRows = useMemo(() => list.rows.map((r, i) => ({
    index: `${(list.pagination.currentPage - 1) * list.pagination.limit + i + 1}.`,
    name: r.name, phone: r.phone || '', email: r.email || '', customer_type: typeName(r.customer_type),
    credit_limit: money(r.credit_limit), current_balance: money(r.current_balance), address: r.address || '',
  })), [list.rows, types, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportColumns = [
    { key: 'index', title: 'no.', width: '50px' }, { key: 'name', title: 'customer_name' }, { key: 'phone', title: 'phone' },
    { key: 'email', title: 'email' }, { key: 'customer_type', title: 'customer_type' }, { key: 'credit_limit', title: 'credit_limit' },
  ];

  const canView = can('view_customers');
  const hasActions = canView || canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('customers', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_customers', lang)}</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportMenu rows={exportRows} columns={exportColumns} title="customers" disabled={list.loading || list.rows.length === 0} />
            {canCreate && <Button variant="primary" mobileLabel={t('new_customer', lang)} onClick={openCreate}>{t('new_customer', lang)}</Button>}
          </div>
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
              { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => setView(row), hidden: !canView },
              { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(row), hidden: !canUpdate },
              { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ isOpen: true, id: row.id, name: row.name }), hidden: !canDelete },
            ]} />
          ) : undefined}
        />
      </div>

      <FormModal isOpen={modal.isOpen} onClose={close} size="lg" title={modal.mode === 'edit' ? t('update_customer', lang) : t('new_customer', lang)}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('customer_name', lang)} required autoFocus value={form.name} onChange={set('name')} error={errors.name} />
            <PhoneInput label={t('phone', lang)} name="phone" value={form.phone} onChange={set('phone')} placeholder={t('enter_phone', lang)} helperText=" " error={errors.phone} />
            <Input type="email" label={t('email', lang)} value={form.email} onChange={set('email')} error={errors.email} />
            <Select label={t('customer_type', lang)} value={form.customer_type} onChange={(e) => setForm((x) => ({ ...x, customer_type: e.target.value }))} placeholder={t('select_customer_type', lang)} options={types.map((x) => ({ value: x.id, label: x.name }))} />
            <NumberInput label={t('credit_limit', lang)} name="credit_limit" value={form.credit_limit} onChange={set('credit_limit')} />
            <NumberInput label={t('credit_due_days', lang)} name="credit_due_days" allowDecimals={false} value={form.credit_due_days} onChange={set('credit_due_days')} />
          </div>
          <Textarea label={t('address', lang)} value={form.address} onChange={set('address')} />
          <div className="flex justify-end gap-3 pt-1">
            <Button type="submit" loading={saving}>{modal.mode === 'edit' ? t('ui_update', lang) : t('save', lang)}</Button>
            <Button type="button" variant="secondary" onClick={close}>{t('ui_cancel', lang)}</Button>
          </div>
        </form>
      </FormModal>

      <FormModal isOpen={!!view} onClose={() => setView(null)} size="xl" title={view?.name}>
        {view && (
          <div className="space-y-4">
            <DetailGrid items={[
              [t('phone', lang), view.phone],
              [t('email', lang), view.email],
              [t('customer_type', lang), typeName(view.customer_type)],
              [t('credit_due_days', lang), view.credit_due_days],
              [t('credit_limit', lang), money(view.credit_limit)],
              [t('current_balance', lang), money(view.current_balance)],
            ]} />
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-left">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('address', lang)}</p>
              <p className="text-gray-800">{view.address || '—'}</p>
            </div>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setView(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>

      <ConfirmModal
        isOpen={confirm.isOpen} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)}
        message={t('ui_confirm_delete', lang, { name: confirm.name })} onClose={() => setConfirm({ isOpen: false })} onConfirm={remove}
      />
    </MainLayout>
  );
}
