// FILE PATH: frontend/src/pages/purchases/Returns.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, Select, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const REASONS = ['damaged', 'wrong_item', 'quality_issue', 'expired', 'excess', 'other'];
const CONDITIONS = ['damaged', 'expired', 'wrong_item', 'quality_issue'];
const REFUNDS = ['apply_to_invoice', 'credit_note', 'cash_refund', 'bank_refund', 'mobile_money'];
const STATUSES = ['draft', 'pending_approval', 'approved', 'shipped', 'received_by_supplier', 'credited', 'cancelled'];
const today = () => new Date().toISOString().slice(0, 10);

export default function Returns() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const suppliers = useSuppliers();
  const list = useServerList({ fetcher: listFetcher(purchaseService.returns), initialFilters: INITIAL });
  useLiveRefresh(['supplierReturnCreated', 'supplierReturnApproved'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);
  const [grns, setGrns] = useState([]);
  const [create, setCreate] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const openCreate = async () => { try { setGrns((await purchaseService.grn.list({ status: 'approved', limit: 100 })).data); } catch { setGrns([]); } setCreate({ grn: null, lines: [], return_date: today(), return_reason: 'damaged', reason_details: '', refund_method: 'credit_note', supplier_invoice_id: '', notes: '' }); };
  const pickGrn = async (id) => {
    if (!id) { setCreate((c) => ({ ...c, grn: null, lines: [] })); return; }
    try { const g = (await purchaseService.grn.get(id)).data; setCreate((c) => ({ ...c, grn: g, lines: (g.items || []).filter((i) => num(i.remaining_returnable_quantity) > 0).map((i) => ({ item: i, qty: '', condition: 'damaged', reason: '' })) })); } catch (err) { showError(err.message); }
  };
  const setLine = (k, patch) => setCreate((c) => ({ ...c, lines: c.lines.map((l, j) => (j === k ? { ...l, ...patch } : l)) }));
  const chosen = create?.lines.filter((l) => num(l.qty) > 0) || [];
  const value = chosen.reduce((s, l) => s + num(l.qty) * num(l.item.unit_cost), 0);

  const save = async () => {
    if (!create.grn) { showError(t('select_grn', lang)); return; }
    if (chosen.length === 0) { showError(t('select_items_to_return', lang)); return; }
    if (chosen.some((l) => num(l.qty) > num(l.item.remaining_returnable_quantity) + 0.0001)) { showError(t('return_quantity_exceeds_remaining', lang)); return; }
    try {
      setBusy(true);
      const res = await purchaseService.returns.create({ supplier_id: create.grn.supplier_id, grn_id: create.grn.id, supplier_invoice_id: create.supplier_invoice_id || undefined, return_date: create.return_date, return_reason: create.return_reason, reason_details: create.reason_details, refund_method: create.refund_method, notes: create.notes,
        items: chosen.map((l) => ({ grn_item_id: l.item.id, product_id: l.item.product_id, batch_id: l.item.batch_id || undefined, quantity: num(l.qty), unit_cost: num(l.item.unit_cost), condition: l.condition, reason: l.reason || create.return_reason })) });
      showSuccess(res.message); setCreate(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  const open = async (r) => { try { setDetail((await purchaseService.returns.get(r.id)).data); } catch (err) { showError(err.message); } };
  const run = async (fn) => { try { setBusy(true); const r = await fn(); showSuccess(r.message); setDetail(null); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };

  const columns = [
    { key: 'return_number', label: t('return_number', lang), render: (r) => <span className="font-medium text-gray-900">#{r.return_number}</span> },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'grn_number', label: t('grn', lang), render: (r) => (r.grn_number ? `#${r.grn_number}` : '—') },
    { key: 'return_date', label: t('date', lang), render: (r) => dateOnly(r.return_date) },
    { key: 'return_reason', label: t('reason', lang), render: (r) => t(r.return_reason, lang) },
    { key: 'total_value', label: t('total', lang), align: 'right', render: (r) => money(r.total_value) },
    { key: 'status', label: t('status', lang), render: (r) => <PStatus value={r.status} /> },
  ];
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('supplier_returns', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_supplier_returns', lang)}</p></div>
          {can('create_supplier_returns') && <Button onClick={openCreate} mobileLabel={t('new_return', lang)}>{t('new_return', lang)}</Button>}
        </div>
        <PFilters list={list} statusOptions={STATUSES} suppliers={suppliers} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(r) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(r) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: r.id, name: `#${r.return_number}` }), hidden: !(can('delete_supplier_returns') && ['draft', 'pending_approval'].includes(r.status)) },
          ]} />} />
      </div>

      <FormModal isOpen={!!create} onClose={() => !busy && setCreate(null)} size="xl" title={t('new_return', lang)}>
        {create && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <Select label={t('grn', lang)} required searchable value={create.grn?.id || ''} onChange={(e) => pickGrn(e.target.value)} placeholder={t('select_grn', lang)} options={grns.map((g) => ({ value: g.id, label: `#${g.grn_number} · ${g.supplier_name} · ${dateOnly(g.received_date)}` }))} />
            {create.grn && <>
              <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 text-right">{t('received', lang)}</th><th className="px-2 py-2 text-right">{t('returnable', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('return_quantity', lang)}</th><th className="px-2 py-2 w-40">{t('condition', lang)}</th><th className="px-3 py-2 text-right">{t('unit_cost', lang)}</th></tr></thead>
                <tbody>{create.lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{t('nothing_to_return', lang)}</td></tr>}{create.lines.map((l, k) => <tr key={l.item.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{l.item.product_name}</td><td className="px-2 py-2 text-right">{num(l.item.received_quantity)}</td><td className="px-2 py-2 text-right">{num(l.item.remaining_returnable_quantity)}</td>
                  <td className="px-2 py-1.5"><input className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded" inputMode="decimal" value={l.qty} onChange={(e) => setLine(k, { qty: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><select className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" value={l.condition} onChange={(e) => setLine(k, { condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}</select></td>
                  <td className="px-3 py-2 text-right">{money(l.item.unit_cost)}</td></tr>)}</tbody></table></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Input type="date" label={t('return_date', lang)} value={create.return_date} onChange={(e) => setCreate((c) => ({ ...c, return_date: e.target.value }))} /><Select label={t('return_reason', lang)} value={create.return_reason} onChange={(e) => setCreate((c) => ({ ...c, return_reason: e.target.value }))} options={REASONS.map((r) => ({ value: r, label: t(r, lang) }))} /><Select label={t('refund_method', lang)} value={create.refund_method} onChange={(e) => setCreate((c) => ({ ...c, refund_method: e.target.value }))} options={REFUNDS.map((r) => ({ value: r, label: t(r, lang) }))} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('reason_details', lang)} value={create.reason_details} onChange={(e) => setCreate((c) => ({ ...c, reason_details: e.target.value }))} /><Textarea rows={2} label={t('notes', lang)} value={create.notes} onChange={(e) => setCreate((c) => ({ ...c, notes: e.target.value }))} /></div>
            </>}
            <div className="flex items-center justify-between"><span className="text-sm">{t('total', lang)}: <b>{money(value)}</b></span><div className="flex gap-3"><Button type="submit" loading={busy} disabled={!create.grn}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setCreate(null)}>{t('ui_cancel', lang)}</Button></div></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="lg" title={`${t('supplier_return', lang)} #${d?.return_number || ''}`}>
        {d && (
          <div className="space-y-4">
            <Dl items={[[t('supplier', lang), d.supplier_name], [t('grn', lang), d.grn_number && `#${d.grn_number}`], [t('return_date', lang), dateOnly(d.return_date)], [t('status', lang), <PStatus key="s" value={d.status} />], [t('return_reason', lang), t(d.return_reason, lang)], [t('refund_method', lang), t(d.refund_method, lang)], [t('total', lang), money(d.total_value)], [t('created_by', lang), d.created_by_name]]} />
            <ul className="divide-y divide-gray-100 text-sm">{(d.items || []).map((i) => <li key={i.id} className="py-1.5 flex justify-between"><span>{i.product_name} × {num(i.quantity)} <span className="text-gray-400">({t(i.condition, lang)}{i.batch_number ? ` · ${i.batch_number}` : ''})</span></span><span>{money(i.line_total)}</span></li>)}</ul>
            {(d.reason_details || d.notes) && <p className="text-sm text-gray-600 text-left">{[d.reason_details, d.notes].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {can('approve_supplier_returns') && ['draft', 'pending_approval'].includes(d.status) && <Button loading={busy} onClick={() => run(() => purchaseService.returns.approve(d.id))}>{t('approve', lang)}</Button>}
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={() => run(() => purchaseService.returns.remove(confirm.id))} />
    </MainLayout>
  );
}
