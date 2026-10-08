// FILE PATH: frontend/src/pages/purchases/Invoices.jsx
import { useState, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import PaymentModal from './PaymentModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, DatePicker, Input, Select, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const STATUSES = ['draft', 'pending', 'approved', 'cancelled'];
const PAY_STATUSES = ['unpaid', 'partial', 'paid'];
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const suppliers = useSuppliers();
  const list = useServerList({ fetcher: listFetcher(purchaseService.invoices, ['payment_status']), initialFilters: { ...INITIAL, payment_status: '' } });
  useLiveRefresh(['supplierInvoiceCreated', 'supplierPaymentCreated'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);

  const [grns, setGrns] = useState([]);
  const [create, setCreate] = useState(null);
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [pay, setPay] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const openCreate = async () => { try { setGrns((await purchaseService.grn.list({ status: 'approved', limit: 100 })).data); } catch { setGrns([]); } setCreate({ grn: null, lines: [], supplier_invoice_number: '', invoice_date: today(), due_date: '', shipping_cost: '0', other_charges: '0', discount_amount: '0', notes: '' }); };
  const pickGrn = async (id) => {
    if (!id) { setCreate((c) => ({ ...c, grn: null, lines: [] })); return; }
    try {
      const g = (await purchaseService.grn.get(id)).data; const sup = suppliers.find((s) => s.id === g.supplier_id);
      const days = parseInt(String(sup?.payment_terms || '').replace(/\D/g, ''), 10); const due = days ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) : '';
      setCreate((c) => ({ ...c, grn: g, supplier_invoice_number: g.supplier_invoice_number || c.supplier_invoice_number, due_date: c.due_date || due,
        lines: (g.items || []).filter((i) => num(i.accepted_quantity || i.received_quantity) > 0).map((i) => ({ item: i, qty: num(i.accepted_quantity || i.received_quantity), unit_price: num(i.unit_cost), tax_rate: 0 })) }));
    } catch (err) { showError(err.message); }
  };
  const tot = useMemo(() => { if (!create) return {}; const sub = create.lines.reduce((s, l) => s + l.qty * l.unit_price, 0); const tax = create.lines.reduce((s, l) => s + (l.qty * l.unit_price * num(l.tax_rate)) / 100, 0); return { sub, tax, total: sub + tax - num(create.discount_amount) + num(create.shipping_cost) + num(create.other_charges) }; }, [create]);

  const save = async () => {
    if (!create.grn) { showError(t('select_grn', lang)); return; }
    if (!create.invoice_date) { showError(t('required_field', lang)); return; }
    try {
      setBusy(true);
      const res = await purchaseService.invoices.create({ supplier_id: create.grn.supplier_id, purchase_order_id: create.grn.purchase_order_id, grn_id: create.grn.id, supplier_invoice_number: create.supplier_invoice_number, invoice_date: create.invoice_date, due_date: create.due_date || undefined,
        subtotal: tot.sub, tax_amount: tot.tax, discount_amount: num(create.discount_amount), shipping_cost: num(create.shipping_cost), other_charges: num(create.other_charges), total_amount: tot.total, notes: create.notes,
        items: create.lines.map((l) => ({ grn_item_id: l.item.id, product_id: l.item.product_id, product_name: l.item.product_name, description: '', quantity: l.qty, unit_price: l.unit_price, tax_rate: num(l.tax_rate), tax_amount: (l.qty * l.unit_price * num(l.tax_rate)) / 100, discount_amount: 0, notes: '' })) });
      showSuccess(res.message); setCreate(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const open = async (i, then) => { try { const d = (await purchaseService.invoices.get(i.id)).data; then ? then(d) : setDetail(d); } catch (err) { showError(err.message); } };
  const saveEdit = async () => {
    try { setBusy(true); const e = edit; const res = await purchaseService.invoices.update(e.id, { supplier_invoice_number: e.supplier_invoice_number, invoice_date: e.invoice_date, due_date: e.due_date || undefined, subtotal: num(e.subtotal), tax_amount: num(e.tax_amount), discount_amount: num(e.discount_amount), shipping_cost: num(e.shipping_cost), other_charges: num(e.other_charges), total_amount: num(e.total_amount), notes: e.notes, status: e.status });
      showSuccess(res.message); setEdit(null); setDetail(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  const setStatus = async (d, status) => { try { setBusy(true); const r = await purchaseService.invoices.update(d.id, { ...d, due_date: dateOnly(d.due_date) || undefined, invoice_date: dateOnly(d.invoice_date), status }); showSuccess(r.message); setDetail(null); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); } };
  const remove = async () => { try { setBusy(true); const r = await purchaseService.invoices.remove(confirm.id); showSuccess(r.message); setDetail(null); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };

  const columns = [
    { key: 'bill_number', label: t('bill_number', lang), render: (i) => <span className="font-medium text-gray-900">#{i.bill_number}</span> },
    { key: 'supplier_invoice_number', label: t('supplier_invoice_number', lang), render: (i) => i.supplier_invoice_number || '—' },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'invoice_date', label: t('invoice_date', lang), render: (i) => dateOnly(i.invoice_date) },
    { key: 'due_date', label: t('due_date', lang), render: (i) => <span className={i.is_overdue ? 'text-red-600 font-medium' : ''}>{dateOnly(i.due_date) || '—'}</span> },
    { key: 'total_amount', label: t('total', lang), align: 'right', render: (i) => money(i.total_amount) },
    { key: 'balance_due', label: t('balance_due', lang), align: 'right', render: (i) => <span className={num(i.balance_due) > 0 ? 'text-red-600' : ''}>{money(i.balance_due)}</span> },
    { key: 'status', label: t('status', lang), render: (i) => <div className="flex gap-1 flex-wrap"><PStatus value={i.status} /><PStatus value={i.is_overdue && i.payment_status !== 'paid' ? 'overdue' : i.payment_status} /></div> },
    { key: 'created_by_name', label: t('created_by', lang), render: (i) => i.created_by_name || '—' },
  ];
  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'bill_number', title: 'bill_number' }, { key: 'supplier_name', title: 'supplier' }, { key: 'invoice_date', title: 'invoice_date' }, { key: 'due_date', title: 'due_date' }, { key: 'total_amount', title: 'total' }, { key: 'amount_paid', title: 'amount_paid' }, { key: 'balance_due', title: 'balance_due' }];
  const exportRows = useMemo(() => list.rows.map((i, k) => ({ index: `${(list.pagination.currentPage - 1) * list.pagination.limit + k + 1}.`, bill_number: i.bill_number, supplier_name: i.supplier_name, invoice_date: dateOnly(i.invoice_date), due_date: dateOnly(i.due_date), total_amount: money(i.total_amount), amount_paid: money(i.amount_paid), balance_due: money(i.balance_due) })), [list.rows, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = detail; const canPay = (x) => can('create_supplier_payments') && num(x.balance_due) > 0 && x.status !== 'cancelled';

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('supplier_invoices', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_supplier_invoices', lang)}</p></div>
          <div className="flex items-center gap-3"><ExportMenu rows={exportRows} columns={exportCols} title="supplier_invoices" orientation="landscape" disabled={list.loading || list.rows.length === 0} />{can('create_supplier_invoices') && <Button onClick={openCreate} mobileLabel={t('new_invoice', lang)}>{t('new_invoice', lang)}</Button>}</div>
        </div>
        <PFilters list={list} statusOptions={STATUSES} suppliers={suppliers} />
        <div className="bg-white p-3 rounded shadow max-w-xs"><Select value={list.filters.payment_status || ''} onChange={(e) => list.setFilter('payment_status', e.target.value)} options={[{ value: '', label: t('all_payment_statuses', lang) }, ...PAY_STATUSES.map((s) => ({ value: s, label: t(s, lang) }))]} /></div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(i) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(i) },
            { label: t('record_payment', lang), icon: ACTION_ICONS.edit, onClick: () => setPay(i), hidden: !canPay(i) },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => open(i, (x) => setEdit({ ...x, invoice_date: dateOnly(x.invoice_date), due_date: dateOnly(x.due_date) })), hidden: !(can('update_supplier_invoices') && num(i.amount_paid) === 0) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: i.id, name: `#${i.bill_number}` }), hidden: !can('delete_supplier_invoices') },
          ]} />} />
      </div>

      <FormModal isOpen={!!create} onClose={() => !busy && setCreate(null)} size="xl" title={t('new_invoice', lang)}>
        {create && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <Select label={t('grn', lang)} required searchable value={create.grn?.id || ''} onChange={(e) => pickGrn(e.target.value)} placeholder={t('select_grn', lang)} options={grns.map((g) => ({ value: g.id, label: `#${g.grn_number} · ${g.supplier_name} · ${money(g.total_value)}` }))} />
            {create.grn && <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Input label={t('supplier_invoice_number', lang)} value={create.supplier_invoice_number} onChange={(e) => setCreate((c) => ({ ...c, supplier_invoice_number: e.target.value }))} /><DatePicker label={t('invoice_date', lang)} required value={create.invoice_date} onChange={(e) => setCreate((c) => ({ ...c, invoice_date: e.target.value }))} /><DatePicker label={t('due_date', lang)} value={create.due_date} onChange={(e) => setCreate((c) => ({ ...c, due_date: e.target.value }))} /></div>
              <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-3 py-2 text-right">{t('quantity', lang)}</th><th className="px-2 py-2 w-32 text-right">{t('unit_price', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('tax', lang)} %</th><th className="px-3 py-2 text-right">{t('total', lang)}</th></tr></thead>
                <tbody>{create.lines.map((l, k) => <tr key={l.item.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{l.item.product_name}</td><td className="px-3 py-2 text-right">{l.qty}</td>
                  <td className="px-2 py-1.5"><input className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded" inputMode="decimal" value={l.unit_price} onChange={(e) => setCreate((c) => ({ ...c, lines: c.lines.map((x, j) => (j === k ? { ...x, unit_price: num(e.target.value) } : x)) }))} /></td>
                  <td className="px-2 py-1.5"><input className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded" inputMode="decimal" value={l.tax_rate} onChange={(e) => setCreate((c) => ({ ...c, lines: c.lines.map((x, j) => (j === k ? { ...x, tax_rate: e.target.value } : x)) }))} /></td>
                  <td className="px-3 py-2 text-right font-medium">{money(l.qty * l.unit_price * (1 + num(l.tax_rate) / 100))}</td></tr>)}</tbody></table></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="grid grid-cols-3 gap-3"><Input label={t('discount', lang)} value={create.discount_amount} onChange={(e) => setCreate((c) => ({ ...c, discount_amount: e.target.value }))} /><Input label={t('shipping_cost', lang)} value={create.shipping_cost} onChange={(e) => setCreate((c) => ({ ...c, shipping_cost: e.target.value }))} /><Input label={t('other_charges', lang)} value={create.other_charges} onChange={(e) => setCreate((c) => ({ ...c, other_charges: e.target.value }))} /></div>
                <div className="text-sm space-y-1"><div className="flex justify-between"><span className="text-gray-500">{t('subtotal', lang)}</span><span>{money(tot.sub)}</span></div><div className="flex justify-between"><span className="text-gray-500">{t('tax', lang)}</span><span>{money(tot.tax)}</span></div><div className="flex justify-between font-bold border-t border-gray-100 pt-1"><span>{t('total', lang)}</span><span>{money(tot.total)}</span></div></div></div>
              <Textarea rows={2} label={t('notes', lang)} value={create.notes} onChange={(e) => setCreate((c) => ({ ...c, notes: e.target.value }))} />
            </>}
            <div className="flex justify-end gap-3"><Button type="submit" loading={busy} disabled={!create.grn}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setCreate(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!edit} onClose={() => !busy && setEdit(null)} size="lg" title={`${t('edit', lang)} #${edit?.bill_number || ''}`}>
        {edit && (
          <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Input label={t('supplier_invoice_number', lang)} value={edit.supplier_invoice_number || ''} onChange={(e) => setEdit((x) => ({ ...x, supplier_invoice_number: e.target.value }))} /><DatePicker label={t('invoice_date', lang)} value={edit.invoice_date} onChange={(e) => setEdit((x) => ({ ...x, invoice_date: e.target.value }))} /><DatePicker label={t('due_date', lang)} value={edit.due_date} onChange={(e) => setEdit((x) => ({ ...x, due_date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">{['subtotal', 'tax_amount', 'discount_amount', 'shipping_cost', 'other_charges'].map((k) => <Input key={k} label={t(k, lang)} value={edit[k] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))} />)}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('total', lang)} value={edit.total_amount ?? ''} onChange={(e) => setEdit((x) => ({ ...x, total_amount: e.target.value }))} /><Select label={t('status', lang)} value={edit.status} onChange={(e) => setEdit((x) => ({ ...x, status: e.target.value }))} options={STATUSES.map((s) => ({ value: s, label: t(s, lang) }))} /></div>
            <Textarea rows={2} label={t('notes', lang)} value={edit.notes || ''} onChange={(e) => setEdit((x) => ({ ...x, notes: e.target.value }))} />
            <div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{t('ui_update', lang)}</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('invoice', lang)} #${d?.bill_number || ''}`}>
        {d && (
          <div className="space-y-4">
            <Dl items={[[t('supplier', lang), d.supplier_name], [t('supplier_invoice_number', lang), d.supplier_invoice_number], [t('invoice_date', lang), dateOnly(d.invoice_date)], [t('due_date', lang), dateOnly(d.due_date)], [t('po_number', lang), d.po_number && `#${d.po_number}`], [t('grn', lang), d.grn_number && `#${d.grn_number}`], [t('status', lang), <div key="s" className="flex gap-1"><PStatus value={d.status} /><PStatus value={d.payment_status} /></div>], [t('created_by', lang), d.created_by_name]]} />
            <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('unit_price', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('total', lang)}</th></tr></thead>
              <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2.5 text-left">{i.product_name || i.description}</td><td className="px-3 py-2.5 text-right">{num(i.quantity)}</td><td className="px-3 py-2.5 text-right">{money(i.unit_price)}</td><td className="px-3 py-2.5 text-right font-medium">{money(i.line_total)}</td></tr>)}</tbody></table></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="border border-gray-200 rounded-md">
                <h4 className="px-3 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border-b border-gray-100">{t('payments', lang)}</h4>
                {(d.payments || []).length === 0 && <p className="px-3 py-4 text-sm text-gray-400">{t('ui_nothing_yet', lang)}</p>}
                <ul className="divide-y divide-gray-100 text-sm">{(d.payments || []).map((p) => <li key={p.id} className="px-3 py-2.5 flex justify-between gap-3"><span className="text-gray-600">{dateOnly(p.payment_date)} · {t(p.payment_method, lang)}{p.created_by_name ? ` · ${t('recorded_by', lang)}: ${p.created_by_name}` : ''} {p.status === 'cancelled' && <PStatus value="cancelled" />}</span><span className="font-medium">{money(p.amount)}</span></li>)}</ul>
              </div>
              <div className="rounded-md border border-gray-200 px-4 py-3 space-y-1.5 text-sm">{[['subtotal', d.subtotal], ['discount', d.discount_amount], ['tax', d.tax_amount], ['shipping_cost', d.shipping_cost], ['other_charges', d.other_charges], ['return_deduction', d.return_deduction], ['total', d.total_amount], ['amount_paid', d.amount_paid], ['balance_due', d.balance_due]].filter(([k, v]) => ['total', 'amount_paid', 'balance_due', 'subtotal'].includes(k) || num(v) !== 0).map(([k, v]) => <div key={k} className={`flex justify-between ${k === 'total' ? 'font-bold text-base border-t border-gray-100 pt-2' : ''}`}><span className="text-gray-500">{t(k, lang)}</span><span>{money(v)}</span></div>)}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {can('update_supplier_invoices') && ['draft', 'pending'].includes(d.status) && <Button loading={busy} variant="secondary" onClick={() => setStatus(d, 'approved')}>{t('approve', lang)}</Button>}
              {canPay(d) && <Button onClick={() => setPay(d)}>{t('record_payment', lang)}</Button>}
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>
      <PaymentModal isOpen={!!pay} invoice={pay} onClose={() => setPay(null)} onSaved={() => { setDetail(null); list.reload(); }} />
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
