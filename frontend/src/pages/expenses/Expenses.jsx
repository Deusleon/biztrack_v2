// FILE PATH: frontend/src/pages/expenses/Expenses.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { expenseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, NumberInput, Select, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { dateOnly } from '../sales/common';
import { formatCurrency, removeNumberFormatting } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const METHODS = ['cash', 'mobile_money', 'bank_transfer', 'cheque'];
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { category: '', amount: '', description: '', payment_method: 'cash', reference_number: '', expense_date: today() };
const fetchExpenses = async ({ page, limit, category, startDate, endDate }) => {
  const r = await expenseService.list({ page, limit, category: category || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.data, pagination: r.pagination, summary: r.summary };
};

export default function Expenses() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const list = useServerList({ fetcher: fetchExpenses, initialFilters: { category: '', startDate: '', endDate: '' } });
  useLiveRefresh(['expenseCreated', 'expenseUpdated', 'expenseDeleted'], list.reload);
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(null);           // { mode, id }
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const canCreate = can('create_expenses'); const canUpdate = can('update_expenses'); const canDelete = can('delete_expenses');
  const loadCats = () => expenseService.categories().then((r) => setCats(r.data.map((c) => (typeof c === 'string' ? c : c.name || c.category)))).catch(() => setCats([]));
  useEffect(() => { loadCats(); }, [currentStore?.id]);

  const openCreate = () => { setForm(EMPTY); setModal({ mode: 'create' }); };
  const openEdit = (e) => { setForm({ category: e.category || '', amount: String(Number(e.amount) || ''), description: e.description || '', payment_method: e.payment_method || 'cash', reference_number: e.reference_number || '', expense_date: dateOnly(e.expense_date) || today() }); setModal({ mode: 'edit', id: e.id }); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const amount = removeNumberFormatting(form.amount) || 0;
    if (!form.category.trim()) { showError(t('category_required', lang)); return; }
    if (amount <= 0) { showError(t('amount_required', lang)); return; }
    try {
      setSaving(true);
      const body = { category: form.category.trim(), amount, description: form.description, payment_method: form.payment_method, reference_number: form.reference_number || undefined, expense_date: form.expense_date };
      if (modal.mode === 'edit') await expenseService.update(modal.id, body); else await expenseService.create(body);
      showSuccess(t(modal.mode === 'edit' ? 'expense_updated' : 'expense_created', lang)); setModal(null); list.reload(); loadCats();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await expenseService.remove(confirm.id); showSuccess(t('expense_deleted', lang)); list.reload(); } catch (err) { showError(err.message); } setConfirm(null); };

  const columns = [
    { key: 'expense_date', label: t('date', lang), render: (e) => dateOnly(e.expense_date) },
    { key: 'category', label: t('category', lang), render: (e) => <span className="font-medium text-gray-900">{e.category}</span> },
    { key: 'description', label: t('description', lang), render: (e) => e.description || '—' },
    { key: 'payment_method', label: t('payment_method', lang), render: (e) => t(e.payment_method, lang) },
    { key: 'reference_number', label: t('reference_number', lang), render: (e) => e.reference_number || '—' },
    { key: 'amount', label: t('amount', lang), align: 'right', render: (e) => <span className="font-medium">{money(e.amount)}</span> },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'expense_date', title: 'date' }, { key: 'category', title: 'category' }, { key: 'description', title: 'description' }, { key: 'payment_method', title: 'payment_method' }, { key: 'amount', title: 'amount' }];
  const toRows = (rows, off = 0) => rows.map((e, i) => ({ index: `${off + i + 1}.`, expense_date: dateOnly(e.expense_date), category: e.category, description: e.description || '', payment_method: t(e.payment_method, lang), amount: money(e.amount) }));
  const exportRows = useMemo(() => toRows(list.rows, (list.pagination.currentPage - 1) * list.pagination.limit), [list.rows, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadAll = async () => { const all = []; let p = 1; let pages = 1; do { const r = await fetchExpenses({ ...list.filters, page: p, limit: 100 }); all.push(...r.data); pages = r.pagination.totalPages; p += 1; } while (p <= pages && p <= 200); return toRows(all); };
  const hasActions = canUpdate || canDelete;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('expenses', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('expenses_desc', lang)}</p></div>
          <div className="flex items-center gap-3"><ExportMenu rows={exportRows} columns={exportCols} title="expenses" loadRows={loadAll} disabled={list.loading || list.rows.length === 0} />{canCreate && <Button onClick={openCreate} mobileLabel={t('add_expense', lang)}>{t('add_expense', lang)}</Button>}</div>
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Select value={list.filters.category || ''} onChange={(e) => list.setFilter('category', e.target.value)} options={[{ value: '', label: t('all_categories', lang) }, ...cats.map((c) => ({ value: c, label: c }))]} />
          <Input type="date" value={list.filters.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} aria-label={t('from', lang)} />
          <Input type="date" value={list.filters.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} aria-label={t('to', lang)} />
          <div className="text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{t('total', lang)}</p><p className="text-lg font-bold text-gray-900">{money(list.summary?.total_amount)}</p></div>
        </div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={hasActions ? (e) => <RowActions actions={[
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(e), hidden: !canUpdate },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: e.id, name: `${e.category} · ${money(e.amount)}` }), hidden: !canDelete },
          ]} /> : undefined} />
      </div>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="md" title={modal?.mode === 'edit' ? t('edit_expense', lang) : t('add_expense', lang)}>
        {modal && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <div><Input label={t('category', lang)} required list="expense-categories" value={form.category} onChange={set('category')} placeholder={t('type_or_choose_category', lang)} /><datalist id="expense-categories">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
            <div className="grid grid-cols-2 gap-3"><NumberInput label={t('amount', lang)} required value={form.amount} onChange={set('amount')} /><Input type="date" label={t('date', lang)} value={form.expense_date} onChange={set('expense_date')} /></div>
            <div className="grid grid-cols-2 gap-3"><Select label={t('payment_method', lang)} value={form.payment_method} onChange={set('payment_method')} options={METHODS.map((m) => ({ value: m, label: t(m, lang) }))} /><Input label={t('reference_number', lang)} value={form.reference_number} onChange={set('reference_number')} /></div>
            <Textarea rows={2} label={t('description', lang)} value={form.description} onChange={set('description')} />
            <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{modal.mode === 'edit' ? t('ui_update', lang) : t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
