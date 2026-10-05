// FILE PATH: frontend/src/pages/purchases/GoodsReceived.jsx
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus, PFilters, useSuppliers, listFetcher, dateOnly, num, INITIAL, Dl } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const STATUSES = ['pending_inspection', 'approved', 'rejected', 'cancelled'];
const cell = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right';

export default function GoodsReceived() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const { state } = useLocation();
  const suppliers = useSuppliers();
  const list = useServerList({ fetcher: listFetcher(purchaseService.grn), initialFilters: INITIAL });
  useLiveRefresh(['grnCreated', 'grnUpdated'], list.reload);
  const money = (v) => formatCurrency(num(v), settings);
  const showExpiry = !!settings?.allowExpireDate;

  const [orders, setOrders] = useState([]);
  const [create, setCreate] = useState(null);         // { po, lines, supplier_delivery_note, supplier_invoice_number, notes }
  const [inspect, setInspect] = useState(null);       // { grn, lines, notes }
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // purchase orders that can still receive goods
  const loadOrders = async () => {
    try { const [a, b] = await Promise.all([purchaseService.orders.list({ status: 'approved', limit: 100 }), purchaseService.orders.list({ status: 'partially_received', limit: 100 })]); setOrders([...a.data, ...b.data]); } catch { setOrders([]); }
  };
  const pickOrder = async (id) => {
    if (!id) { setCreate((c) => ({ ...c, po: null, lines: [] })); return; }
    try {
      const po = (await purchaseService.orders.get(id)).data;
      setCreate((c) => ({ ...c, po, lines: (po.items || []).filter((i) => num(i.pending_quantity) > 0).map((i) => ({ item: i, qty: String(num(i.pending_quantity)), unit_cost: String(num(i.unit_price)), selling_price: '', batch_number: '', manufacturing_date: '', expiry_date: '' })) }));
    } catch (err) { showError(err.message); }
  };
  const openCreate = async (poId) => { await loadOrders(); setCreate({ po: null, lines: [], supplier_delivery_note: '', supplier_invoice_number: '', notes: '' }); if (poId) pickOrder(poId); };
  useEffect(() => { if (state?.poId && can('create_grn')) openCreate(state.poId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setLine = (i, patch) => setCreate((c) => ({ ...c, lines: c.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));

  const save = async () => {
    const lines = create.lines.filter((l) => num(l.qty) > 0);
    if (!create.po) { showError(t('select_purchase_order', lang)); return; }
    if (lines.length === 0) { showError(t('enter_received_quantity', lang)); return; }
    if (lines.some((l) => num(l.qty) > num(l.item.pending_quantity) + 0.0001)) { showError(t('received_more_than_ordered', lang)); return; }
    if (settings?.useBatchWisePrice && lines.some((l) => num(l.selling_price) <= 0)) { showError(t('selling_price_required_for_batchwise_pricing', lang)); return; }
    try {
      setBusy(true);
      const res = await purchaseService.grn.create({ supplier_id: create.po.supplier_id, purchase_order_id: create.po.id, supplier_delivery_note: create.supplier_delivery_note, supplier_invoice_number: create.supplier_invoice_number, notes: create.notes,
        items: lines.map((l) => ({ po_item_id: l.item.id, purchase_order_item_id: l.item.id, product_id: l.item.product_id, expected_quantity: num(l.item.pending_quantity), quantity_received: num(l.qty), received_quantity: num(l.qty), unit_cost: num(l.unit_cost), unit_price: num(l.unit_cost), selling_price: l.selling_price === '' ? undefined : num(l.selling_price), batch_number: l.batch_number || undefined, manufacturing_date: l.manufacturing_date || undefined, expiry_date: l.expiry_date || undefined })) });
      showSuccess(res.message); setCreate(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const open = async (g, then) => { try { const d = (await purchaseService.grn.get(g.id)).data; then ? then(d) : setDetail(d); } catch (err) { showError(err.message); } };
  const openInspect = (d) => setInspect({ grn: d, notes: '', lines: (d.items || []).map((i) => ({ item: i, accepted: String(num(i.received_quantity)), rejected: '0', reason: '' })) });
  const saveInspect = async () => {
    const bad = inspect.lines.find((l) => num(l.accepted) + num(l.rejected) > num(l.item.received_quantity) + 0.0001 || num(l.accepted) < 0 || num(l.rejected) < 0);
    if (bad) { showError(t('inspection_quantities_invalid', lang)); return; }
    const acc = inspect.lines.reduce((s, l) => s + num(l.accepted), 0); const rej = inspect.lines.reduce((s, l) => s + num(l.rejected), 0);
    try {
      setBusy(true);
      const res = await purchaseService.grn.inspect(inspect.grn.id, { inspection_status: rej === 0 ? 'passed' : acc === 0 ? 'failed' : 'partial', inspection_notes: inspect.notes,
        items: inspect.lines.map((l) => ({ id: l.item.id, grn_item_id: l.item.id, accepted_quantity: num(l.accepted), rejected_quantity: num(l.rejected), rejection_reason: l.reason || undefined, unit_cost: num(l.item.unit_cost), selling_price: l.item.selling_price == null ? undefined : num(l.item.selling_price) })) });
      showSuccess(res.message); setInspect(null); setDetail(null); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  const remove = async () => { try { setBusy(true); const r = await purchaseService.grn.remove(confirm.id); showSuccess(r.message); setDetail(null); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };

  const columns = [
    { key: 'grn_number', label: t('grn_number', lang), render: (g) => <span className="font-medium text-gray-900">#{g.grn_number}</span> },
    { key: 'po_number', label: t('po_number', lang), render: (g) => (g.po_number ? `#${g.po_number}` : '—') },
    { key: 'supplier_name', label: t('supplier', lang) },
    { key: 'received_date', label: t('received_date', lang), render: (g) => dateOnly(g.received_date) },
    { key: 'total_quantity', label: t('quantity', lang), align: 'right', render: (g) => num(g.total_quantity) },
    { key: 'total_value', label: t('total', lang), align: 'right', render: (g) => money(g.total_value) },
    { key: 'status', label: t('status', lang), render: (g) => <PStatus value={g.status} /> },
  ];
  const d = detail;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('goods_received', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_goods_received', lang)}</p></div>
          {can('create_grn') && <Button onClick={() => openCreate()} mobileLabel={t('new_grn', lang)}>{t('new_grn', lang)}</Button>}
        </div>
        <PFilters list={list} statusOptions={STATUSES} suppliers={suppliers} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(g) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(g) },
            { label: t('inspect', lang), icon: ACTION_ICONS.edit, onClick: () => open(g, openInspect), hidden: !(can('approve_grn') && g.status === 'pending_inspection') },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: g.id, name: `#${g.grn_number}` }), hidden: !can('delete_grn') },
          ]} />} />
      </div>

      <FormModal isOpen={!!create} onClose={() => !busy && setCreate(null)} size="xl" title={t('new_grn', lang)}>
        {create && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <Select label={t('purchase_order', lang)} required searchable value={create.po?.id || ''} onChange={(e) => pickOrder(e.target.value)} placeholder={t('select_purchase_order', lang)} options={orders.map((o) => ({ value: o.id, label: `#${o.po_number} · ${o.supplier_name} · ${money(o.total_amount)}` }))} />
            {create.po && <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('supplier_delivery_note', lang)} value={create.supplier_delivery_note} onChange={(e) => setCreate((c) => ({ ...c, supplier_delivery_note: e.target.value }))} /><Input label={t('supplier_invoice_number', lang)} value={create.supplier_invoice_number} onChange={(e) => setCreate((c) => ({ ...c, supplier_invoice_number: e.target.value }))} /></div>
              <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-2 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 text-right">{t('pending', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('received', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('unit_cost', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('selling_price', lang)}{settings?.useBatchWisePrice ? ' *' : ''}</th><th className="px-2 py-2 w-32">{t('batch_number', lang)}</th><th className="px-2 py-2 w-36">{t('mfg_date', lang)}</th>{showExpiry && <th className="px-2 py-2 w-36">{t('exp_date', lang)}</th>}</tr></thead>
                <tbody>{create.lines.map((l, i) => (
                  <tr key={l.item.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-left">{l.item.product_name}</td><td className="px-2 py-1.5 text-right">{num(l.item.pending_quantity)}</td>
                    <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.selling_price} onChange={(e) => setLine(i, { selling_price: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={`${cell} text-left`} value={l.batch_number} onChange={(e) => setLine(i, { batch_number: e.target.value })} /></td>
                    <td className="px-2 py-1.5 min-w-[11rem]"><DatePicker value={l.manufacturing_date} onChange={(e) => setLine(i, { manufacturing_date: e.target.value })} placeholder={t('mfg_date', lang)} /></td>
                    {showExpiry && <td className="px-2 py-1.5 min-w-[11rem]"><DatePicker value={l.expiry_date} onChange={(e) => setLine(i, { expiry_date: e.target.value })} placeholder={t('exp_date', lang)} /></td>}
                  </tr>))}</tbody></table></div>
              <Textarea rows={2} label={t('notes', lang)} value={create.notes} onChange={(e) => setCreate((c) => ({ ...c, notes: e.target.value }))} />
            </>}
            <div className="flex justify-end gap-3"><Button type="submit" loading={busy} disabled={!create.po}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setCreate(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('grn', lang)} #${d?.grn_number || ''}`}>
        {d && (
          <div className="space-y-4">
            <Dl items={[[t('supplier', lang), d.supplier_name], [t('po_number', lang), d.po_number && `#${d.po_number}`], [t('received_date', lang), dateOnly(d.received_date)], [t('status', lang), <PStatus key="s" value={d.status} />], [t('supplier_delivery_note', lang), d.supplier_delivery_note], [t('supplier_invoice_number', lang), d.supplier_invoice_number], [t('received_by', lang), d.received_by_name], [t('inspected_by', lang), d.inspected_by_name]]} />
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-3 py-2 text-right">{t('expected', lang)}</th><th className="px-3 py-2 text-right">{t('received', lang)}</th><th className="px-3 py-2 text-right">{t('accepted', lang)}</th><th className="px-3 py-2 text-right">{t('rejected', lang)}</th><th className="px-3 py-2 text-right">{t('unit_cost', lang)}</th><th className="px-3 py-2 text-left">{t('batch_number', lang)}</th>{showExpiry && <th className="px-3 py-2 text-left">{t('exp_date', lang)}</th>}</tr></thead>
              <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{i.product_name}</td><td className="px-3 py-2 text-right">{num(i.expected_quantity)}</td><td className="px-3 py-2 text-right">{num(i.received_quantity)}</td><td className="px-3 py-2 text-right">{num(i.accepted_quantity)}</td><td className="px-3 py-2 text-right">{num(i.rejected_quantity)}</td><td className="px-3 py-2 text-right">{money(i.unit_cost)}</td><td className="px-3 py-2 text-left">{i.batch_number || i.inventory_batch_number || '—'}</td>{showExpiry && <td className="px-3 py-2 text-left">{dateOnly(i.expiry_date) || '—'}</td>}</tr>)}</tbody></table></div>
            {(d.notes || d.inspection_notes) && <p className="text-sm text-gray-600 text-left">{[d.notes, d.inspection_notes].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {can('approve_grn') && d.status === 'pending_inspection' && <Button onClick={() => openInspect(d)}>{t('inspect', lang)}</Button>}
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={!!inspect} onClose={() => !busy && setInspect(null)} size="xl" title={`${t('inspect', lang)} · #${inspect?.grn?.grn_number || ''}`}>
        {inspect && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 text-left">{t('inspection_help', lang)}</p>
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-3 py-2 text-right">{t('received', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('accepted', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('rejected', lang)}</th><th className="px-2 py-2 w-48">{t('rejection_reason', lang)}</th></tr></thead>
              <tbody>{inspect.lines.map((l, i) => (
                <tr key={l.item.id} className="border-t border-gray-100"><td className="px-3 py-2 text-left">{l.item.product_name}</td><td className="px-3 py-2 text-right">{num(l.item.received_quantity)}</td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.accepted} onChange={(e) => setInspect((s) => ({ ...s, lines: s.lines.map((x, k) => (k === i ? { ...x, accepted: e.target.value } : x)) }))} /></td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.rejected} onChange={(e) => setInspect((s) => ({ ...s, lines: s.lines.map((x, k) => (k === i ? { ...x, rejected: e.target.value } : x)) }))} /></td>
                  <td className="px-2 py-1.5"><input className={`${cell} text-left`} value={l.reason} onChange={(e) => setInspect((s) => ({ ...s, lines: s.lines.map((x, k) => (k === i ? { ...x, reason: e.target.value } : x)) }))} /></td></tr>))}</tbody></table></div>
            <Textarea rows={2} label={t('inspection_notes', lang)} value={inspect.notes} onChange={(e) => setInspect((s) => ({ ...s, notes: e.target.value }))} />
            <div className="flex justify-end gap-3"><Button loading={busy} onClick={saveInspect}>{t('save', lang)}</Button><Button variant="secondary" onClick={() => setInspect(null)}>{t('ui_cancel', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
