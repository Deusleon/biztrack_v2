// FILE PATH: frontend/src/pages/inventory/StockTransfer.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { stockTransferService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, ConfirmModal, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { toPaging, dateOnly, DetailGrid } from '../sales/common';
import { PStatus, useAllProducts } from '../purchases/common';
import { formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const num = (v) => Number(v) || 0;
const DIRECTIONS = ['all', 'outgoing', 'incoming'];
const STATUSES = ['pending_approval', 'pending', 'approved', 'in_transit', 'completed', 'cancelled'];
const fetchTransfers = async ({ page, limit, search, direction, status, startDate, endDate }) => {
  const r = await stockTransferService.history({ page, limit, search: search || undefined, direction: direction || 'all', status: status || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.transfers || [], pagination: toPaging(r.pagination, limit) };
};
const blank = () => ({ key: Math.random().toString(36).slice(2), product_id: '', quantity: '' });
const cell = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right';

export default function StockTransfer() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { stores, currentStore } = useStore();
  const { settings, loading: settingsLoading } = useStoreSettings();
  const products = useAllProducts();
  const list = useServerList({ fetcher: fetchTransfers, initialFilters: { search: '', direction: 'all', status: '', startDate: '', endDate: '' } });
  useLiveRefresh(['stockTransferCreated', 'stockTransferUpdated'], list.reload);
  const [create, setCreate] = useState(null);         // { destination, notes, items }
  const [detail, setDetail] = useState(null);
  const [receive, setReceive] = useState(null);       // { transfer, lines }
  const [confirm, setConfirm] = useState(null);       // { kind, transfer }
  const [busy, setBusy] = useState(false);
  const showExpiry = !!settings?.allowExpireDate;
  const others = stores.filter((s) => s.id !== currentStore?.id);
  const incoming = (tr) => tr.destination_store_id === currentStore?.id;
  const canApprove = can('approve_stock_transfer');

  const save = async () => {
    const items = create.items.filter((i) => i.product_id && num(i.quantity) > 0);
    if (!create.destination) { showError(t('select_destination_store', lang)); return; }
    if (items.length === 0) { showError(t('add_at_least_one_item', lang)); return; }
    try { setBusy(true); const r = await stockTransferService.create({ destination_store_id: create.destination, items: items.map((i) => ({ product_id: i.product_id, quantity: num(i.quantity) })), notes: create.notes }); showSuccess(r.message); setCreate(null); list.reload(); }
    catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  const open = async (tr, then) => { try { const d = (await stockTransferService.detail(tr.id)).transfer; then ? then(d) : setDetail(d); } catch (err) { showError(err.message); } };
  const run = async (fn, after) => { try { setBusy(true); const r = await fn(); showSuccess(r.message); after?.(); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); setConfirm(null); } };
  const openReceive = (d) => setReceive({ transfer: d, lines: (d.items || []).map((i) => ({ item: i, quantity: String(num(i.quantity)), batch_number: i.batch_number || '', cost_price: '', selling_price: '', expiry_date: '' })) });
  const saveReceive = async () => {
    const bad = receive.lines.find((l) => num(l.quantity) < 0 || num(l.quantity) > num(l.item.quantity) + 0.0001);
    if (bad) { showError(t('received_more_than_ordered', lang)); return; }
    try { setBusy(true); const r = await stockTransferService.receive(receive.transfer.id, receive.lines.map((l) => ({ id: l.item.id, product_id: l.item.product_id, quantity: num(l.quantity), batch_number: l.batch_number || undefined, cost_price: l.cost_price === '' ? undefined : num(l.cost_price), selling_price: l.selling_price === '' ? undefined : num(l.selling_price), expiry_date: l.expiry_date || undefined }))); showSuccess(r.message); setReceive(null); setDetail(null); list.reload(); }
    catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'reference_number', label: t('reference', lang), render: (x) => <span className="font-medium text-gray-900">{x.reference_number}</span> },
    { key: 'direction', label: t('direction', lang), render: (x) => <span className={`px-2 py-0.5 rounded text-xs font-medium ${incoming(x) ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{t(incoming(x) ? 'incoming' : 'outgoing', lang)}</span> },
    { key: 'stores', label: t('stores', lang), render: (x) => `${x.source_store_name} → ${x.destination_store_name}` },
    { key: 'created_at', label: t('date', lang), render: (x) => dateOnly(x.created_at) },
    { key: 'items_count', label: t('items', lang), align: 'right' },
    { key: 'total_quantity', label: t('quantity', lang), align: 'right', render: (x) => formatNumberWithCommas(x.total_quantity) },
    { key: 'status', label: t('status', lang), render: (x) => <PStatus value={x.status} /> },
    { key: 'created_by_name', label: t('created_by', lang), render: (x) => x.created_by_name || '—' },
  ];
  const d = detail; const pending = (x) => ['pending_approval', 'pending'].includes(x?.status);
  const toReceive = (x) => incoming(x) && ['approved', 'in_transit'].includes(x.status) && can('create_stock_transfer');
  const transfersOff = !settingsLoading && settings && Object.keys(settings).length > 0 && !settings.interStoreTransfer;

  if (transfersOff) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <div className="page-header text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('stock_transfer', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_stock_transfers', lang)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-8 text-center">
            <h2 className="text-base font-semibold text-amber-800">{t('inter_store_transfer_disabled', lang)}</h2>
            <p className="text-sm text-amber-700 mt-1">{t('inter_store_transfer_disabled_description', lang)}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('stock_transfer', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_stock_transfers', lang)}</p></div>
          {can('create_stock_transfer') && others.length > 0 && <Button onClick={() => setCreate({ destination: '', notes: '', items: [blank()] })} mobileLabel={t('new_transfer', lang)}>{t('new_transfer', lang)}</Button>}
        </div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input value={list.searchText} onChange={(e) => list.setFilter('search', e.target.value)} placeholder={t('ui_search_placeholder', lang)} />
          <Select value={list.filters.direction || 'all'} onChange={(e) => list.setFilter('direction', e.target.value)} options={DIRECTIONS.map((x) => ({ value: x, label: t(x, lang) }))} />
          <Select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: t('all', lang) }, ...STATUSES.map((x) => ({ value: x, label: t(x, lang) }))]} />
          <DatePicker value={list.filters.startDate || ''} onChange={(e) => list.setFilter('startDate', e.target.value)} placeholder={t('start_date', lang)} />
          <DatePicker align="right" value={list.filters.endDate || ''} onChange={(e) => list.setFilter('endDate', e.target.value)} placeholder={t('end_date', lang)} />
        </div>
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(x) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(x) },
            { label: t('approve', lang), icon: ACTION_ICONS.edit, onClick: () => setConfirm({ kind: 'approve', transfer: x }), hidden: !(canApprove && pending(x) && !incoming(x)) },
            { label: t('receive', lang), icon: ACTION_ICONS.edit, onClick: () => open(x, openReceive), hidden: !toReceive(x) },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ kind: 'delete', transfer: x }), hidden: !(can('delete_stock_transfer') && pending(x)) },
          ]} />} />
      </div>

      <FormModal isOpen={!!create} onClose={() => !busy && setCreate(null)} size="xl" title={t('new_transfer', lang)}>
        {create && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <Select label={t('destination_store', lang)} required value={create.destination} onChange={(e) => setCreate((c) => ({ ...c, destination: e.target.value }))} placeholder={t('select_destination_store', lang)} options={others.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-2 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 text-right">{t('current_stock', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('quantity', lang)}</th><th className="w-8" /></tr></thead>
              <tbody>{create.items.map((i) => { const p = products.find((x) => x.id === i.product_id); return (
                <tr key={i.key} className="border-t border-gray-100"><td className="px-2 py-1.5 min-w-[14rem]"><Select searchable value={i.product_id} onChange={(e) => setCreate((c) => ({ ...c, items: c.items.map((x) => (x.key === i.key ? { ...x, product_id: e.target.value } : x)) }))} placeholder={t('select_product', lang)} options={products.map((x) => ({ value: x.id, label: x.name }))} /></td>
                  <td className="px-2 py-1.5 text-right">{p ? `${formatNumberWithCommas(p.current_stock)} ${t(p.unit, lang)}` : '—'}</td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={i.quantity} onChange={(e) => setCreate((c) => ({ ...c, items: c.items.map((x) => (x.key === i.key ? { ...x, quantity: e.target.value } : x)) }))} /></td>
                  <td className="px-1"><button type="button" className="text-gray-400 hover:text-red-600" onClick={() => setCreate((c) => ({ ...c, items: c.items.length > 1 ? c.items.filter((x) => x.key !== i.key) : [blank()] }))} aria-label={t('delete', lang)}>✕</button></td></tr>); })}</tbody></table></div>
            <Button type="button" variant="secondary" onClick={() => setCreate((c) => ({ ...c, items: [...c.items, blank()] }))}>{t('add_item', lang)}</Button>
            <Textarea rows={2} label={t('notes', lang)} value={create.notes} onChange={(e) => setCreate((c) => ({ ...c, notes: e.target.value }))} />
            <p className="text-xs text-gray-500 text-left">{t('transfer_help', lang)}</p>
            <div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setCreate(null)}>{t('ui_cancel', lang)}</Button></div>
          </form>
        )}
      </FormModal>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('stock_transfer', lang)} ${d?.reference_number || ''}`}>
        {d && (
          <div className="space-y-5 text-left">
            <DetailGrid items={[[t('source_store', lang), d.source_store_name], [t('destination_store', lang), d.destination_store_name], [t('date', lang), dateOnly(d.created_at)], [t('status', lang), <PStatus key="s" value={d.status} />], [t('created_by', lang), d.created_by_name], [t('approved_by', lang), d.approved_by_name], [t('received_by', lang), d.received_by_name]]} />
            <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th><th className="px-3 py-2.5 text-right font-medium">{t('received', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('batch_number', lang)}</th></tr></thead>
              <tbody>{(d.items || []).map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="px-3 py-2.5 text-left">{i.product_name}</td><td className="px-3 py-2.5 text-right">{formatNumberWithCommas(i.quantity)} {t(i.product_unit, lang)}</td><td className="px-3 py-2.5 text-right">{i.received_quantity == null ? '—' : formatNumberWithCommas(i.received_quantity)}</td><td className="px-3 py-2.5">{i.batch_number || '—'}</td></tr>)}</tbody></table></div>
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600"><p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>{d.notes || '—'}</div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
              {canApprove && pending(d) && !incoming(d) && <Button loading={busy} onClick={() => setConfirm({ kind: 'approve', transfer: d })}>{t('approve', lang)}</Button>}
              {toReceive(d) && <Button onClick={() => openReceive(d)}>{t('receive', lang)}</Button>}
              {(can('create_stock_transfer') || canApprove) && ['pending_approval', 'pending', 'approved', 'in_transit'].includes(d.status) && <Button variant="secondary" onClick={() => setConfirm({ kind: 'cancel', transfer: d })}>{t('cancel_transfer', lang)}</Button>}
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={!!receive} onClose={() => !busy && setReceive(null)} size="xl" title={`${t('receive', lang)} · ${receive?.transfer?.reference_number || ''}`}>
        {receive && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 text-left">{t('receive_transfer_help', lang)}</p>
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-2 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 text-right">{t('sent', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('received', lang)}</th><th className="px-2 py-2 w-32">{t('batch_number', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('cost_price', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('selling_price', lang)}</th>{showExpiry && <th className="px-2 py-2 w-36">{t('exp_date', lang)}</th>}</tr></thead>
              <tbody>{receive.lines.map((l, k) => { const up = (patch) => setReceive((r) => ({ ...r, lines: r.lines.map((x, j) => (j === k ? { ...x, ...patch } : x)) })); return (
                <tr key={l.item.id} className="border-t border-gray-100"><td className="px-2 py-1.5 text-left">{l.item.product_name}</td><td className="px-2 py-1.5 text-right">{formatNumberWithCommas(l.item.quantity)}</td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.quantity} onChange={(e) => up({ quantity: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={`${cell} text-left`} value={l.batch_number} onChange={(e) => up({ batch_number: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.cost_price} onChange={(e) => up({ cost_price: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={cell} inputMode="decimal" value={l.selling_price} onChange={(e) => up({ selling_price: e.target.value })} /></td>
                  {showExpiry && <td className="px-2 py-1.5"><DatePicker value={l.expiry_date} onChange={(e) => up({ expiry_date: e.target.value })} placeholder={t('exp_date', lang)} /></td>}</tr>); })}</tbody></table></div>
            <div className="flex justify-end gap-3"><Button loading={busy} onClick={saveReceive}>{t('receive', lang)}</Button><Button variant="secondary" onClick={() => setReceive(null)}>{t('ui_cancel', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <ConfirmModal isOpen={!!confirm} variant={confirm?.kind === 'delete' ? 'danger' : 'warning'} title={t(confirm?.kind === 'approve' ? 'approve' : confirm?.kind === 'cancel' ? 'cancel_transfer' : 'delete', lang)} confirmText={t('confirm', lang)} cancelText={t('ui_cancel', lang)}
        message={t(confirm?.kind === 'approve' ? 'confirm_approve_transfer' : confirm?.kind === 'cancel' ? 'confirm_cancel_transfer' : 'ui_confirm_delete', lang, { name: confirm?.transfer?.reference_number })} onClose={() => setConfirm(null)}
        onConfirm={() => { const id = confirm.transfer.id; if (confirm.kind === 'approve') run(() => stockTransferService.approve(id), () => setDetail(null)); else if (confirm.kind === 'cancel') run(() => stockTransferService.cancel(id), () => setDetail(null)); else run(() => stockTransferService.remove(id)); }} />
    </MainLayout>
  );
}
