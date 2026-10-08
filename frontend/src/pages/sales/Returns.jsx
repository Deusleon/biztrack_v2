// FILE PATH: frontend/src/pages/sales/Returns.jsx
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { salesService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, Button, RowActions, ACTION_ICONS, Input, Select, Textarea, ConfirmModal } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { FilterBar, StatusBadge, DetailGrid, toPaging, dateOnly } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const fetchReturns = async ({ page, limit, search, status, startDate, endDate }) => {
  const r = await salesService.returns({ page, limit, search: search || undefined, status: status || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.returns || [], pagination: toPaging(r.pagination, limit), summary: r.summary };
};
const CONDITIONS = ['good', 'damaged', 'expired'];

export default function Returns() {
  const { can } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const { state } = useLocation();
  const list = useServerList({ fetcher: fetchReturns, initialFilters: { search: '', status: '', startDate: '', endDate: '' } });
  useLiveRefresh(['salesReturnCreated', 'salesReturnUpdated'], list.reload);
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const canCreate = can('create_sales_return');

  const [create, setCreate] = useState(null);       // { invoice, sale, lines, reason, notes, refundMethod }
  const [invoiceInput, setInvoiceInput] = useState('');
  const [detail, setDetail] = useState(null);
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (inv) => {
    const number = String(inv || invoiceInput).trim();
    if (!number) return;
    try {
      const d = await salesService.saleDetails(number);
      setCreate({ invoice: number, sale: d, reason: '', notes: '', refundMethod: 'cash',
        lines: (d.items || []).map((i) => ({ product_id: i.product_id, name: i.name, sold: Number(i.quantity), price: Number(i.price) - Number(i.discount || 0), qty: 0, condition: 'good', restock: true })) });
    } catch (err) { showError(err.message); }
  };
  // arriving from "Sales history → Return"
  useEffect(() => { if (state?.invoiceNumber && canCreate) { setInvoiceInput(state.invoiceNumber); lookup(state.invoiceNumber); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i, patch) => setCreate((c) => ({ ...c, lines: c.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const chosen = create?.lines.filter((l) => l.qty > 0) || [];
  const refund = chosen.reduce((s, l) => s + l.qty * l.price, 0);

  const save = async () => {
    if (chosen.length === 0) { showError(t('select_items_to_return', lang)); return; }
    if (chosen.some((l) => l.qty > l.sold)) { showError(t('return_quantity_exceeds_sold', lang)); return; }
    try {
      setBusy(true);
      const r = await salesService.createReturn({ invoiceNumber: create.invoice, items: chosen.map((l) => ({ product_id: l.product_id, quantity: l.qty, price: l.price, condition: l.condition, restock: l.restock && l.condition === 'good', reason: create.reason || undefined })), reason: create.reason, notes: create.notes, refundMethod: create.refundMethod });
      showSuccess(r.message || 'sales_return_created'); setCreate(null); setInvoiceInput(''); list.reload();
    } catch (err) { showError(err.message); } finally { setBusy(false); }
  };

  const view = async (r) => { try { setDetail(await salesService.returnDetails(r.id)); } catch (err) { showError(err.message); } };
  const act = async (fn, msg) => { try { setBusy(true); const r = await fn(); showSuccess(r?.message || msg); setDetail(null); setReject(null); setReason(''); list.reload(); } catch (err) { showError(err.message); } finally { setBusy(false); } };

  const columns = [
    { key: 'return_number', label: t('return_number', lang), render: (r) => <span className="font-medium text-gray-900">{r.return_number || `#${String(r.id).slice(0, 8)}`}</span> },
    { key: 'invoice_number', label: t('invoice_number', lang), render: (r) => `#${r.original_invoice_number || r.invoice_number}` },
    { key: 'created_at', label: t('date', lang), render: (r) => dateOnly(r.created_at) },
    { key: 'customer_name', label: t('customer', lang), render: (r) => r.customer_name || t('walk_in', lang) },
    { key: 'total_refund', label: t('refund_amount', lang), align: 'right', render: (r) => money(r.total_refund ?? r.refund_amount ?? r.total_amount) },
    { key: 'status', label: t('status', lang), render: (r) => <StatusBadge value={r.status} /> },
    { key: 'created_by_name', label: t('created_by', lang), render: (r) => r.created_by_name || '—' },
  ];
  const summary = list.summary || {};
  const d = detail?.return || detail?.sales_return || detail; const dItems = detail?.items || d?.items || [];

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('sales_returns', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_sales_returns', lang)}</p></div>
          {canCreate && <div className="flex gap-2 items-end"><Input value={invoiceInput} onChange={(e) => setInvoiceInput(e.target.value)} placeholder={t('invoice_number', lang)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} /><Button onClick={() => lookup()}>{t('new_return', lang)}</Button></div>}
        </div>
        {Object.keys(summary).length > 0 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['total', summary.total], ['pending', summary.pending], ['approved', summary.approved], ['total_refunded', money(summary.totalRefunded)]].map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{t(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1">{v ?? 0}</p></div>)}</div>}
        <FilterBar list={list} statusKey="status" statusOptions={['pending', 'approved', 'rejected']} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(r) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => view(r) }]} />} />
      </div>

      <FormModal isOpen={!!create} onClose={() => !busy && setCreate(null)} size="xl" title={`${t('new_return', lang)} · #${create?.invoice || ''}`}>
        {create && (
          <div className="space-y-4 text-left">
            <div className="overflow-x-auto border border-gray-100 rounded"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 text-right">{t('sold', lang)}</th><th className="px-2 py-2 w-24 text-right">{t('return_quantity', lang)}</th><th className="px-2 py-2 w-32">{t('condition', lang)}</th><th className="px-2 py-2 text-center">{t('restock', lang)}</th><th className="px-3 py-2 text-right">{t('refund_amount', lang)}</th></tr></thead>
              <tbody>{create.lines.map((l, i) => (
                <tr key={`${l.product_id}-${i}`} className="border-t border-gray-100">
                  <td className="px-3 py-2">{l.name}</td><td className="px-2 py-2 text-right">{l.sold}</td>
                  <td className="px-2 py-2"><input className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded" type="number" min="0" max={l.sold} step="any" value={l.qty || ''} onChange={(e) => setLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })} /></td>
                  <td className="px-2 py-2"><select className="w-full px-2 py-1 text-sm border border-gray-300 rounded" value={l.condition} onChange={(e) => setLine(i, { condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}</select></td>
                  <td className="px-2 py-2 text-center"><input type="checkbox" checked={l.restock && l.condition === 'good'} disabled={l.condition !== 'good'} onChange={(e) => setLine(i, { restock: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-right">{money(l.qty * l.price)}</td>
                </tr>))}</tbody></table></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label={t('refund_method', lang)} value={create.refundMethod} onChange={(e) => setCreate((c) => ({ ...c, refundMethod: e.target.value }))} options={['cash', 'mobile_money', 'bank_transfer', 'credit_note'].map((m) => ({ value: m, label: t(m, lang) }))} />
              <Input label={t('reason', lang)} value={create.reason} onChange={(e) => setCreate((c) => ({ ...c, reason: e.target.value }))} />
            </div>
            <Textarea rows={2} label={t('notes', lang)} value={create.notes} onChange={(e) => setCreate((c) => ({ ...c, notes: e.target.value }))} />
            <div className="flex items-center justify-between pt-2 border-t border-gray-100"><span className="text-sm">{t('refund_amount', lang)}: <b>{money(refund)}</b></span>
              <div className="flex gap-3"><Button loading={busy} onClick={save}>{t('save', lang)}</Button><Button variant="secondary" onClick={() => setCreate(null)}>{t('ui_cancel', lang)}</Button></div></div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="xl" title={`${t('sales_return', lang)} ${d?.return_number || ''}`}>
        {d && (
          <div className="space-y-5 text-left">
            <DetailGrid items={[
              [t('invoice_number', lang), (d.original_invoice_number || d.invoice_number) && `#${d.original_invoice_number || d.invoice_number}`],
              [t('customer', lang), d.customer_name || t('walk_in', lang)],
              [t('date', lang), dateOnly(d.created_at)],
              [t('status', lang), <StatusBadge value={d.status} />],
              [t('created_by', lang), d.created_by_name],
              [t('refund_method', lang), t(d.refund_method, lang)],
              [t('refund_amount', lang), money(d.total_refund ?? d.refund_amount ?? d.total_amount)],
            ]} />
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500"><tr>
                  <th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('condition', lang)}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('restock', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('total', lang)}</th>
                </tr></thead>
                <tbody>{dItems.map((i, k) => (
                  <tr key={i.id || k} className="border-t border-gray-100">
                    <td className="px-3 py-2.5">{i.name || i.product_name}</td>
                    <td className="px-3 py-2.5 text-right">{Number(i.quantity)}</td>
                    <td className="px-3 py-2.5">{t(i.condition, lang)}</td>
                    <td className="px-3 py-2.5">{i.restock ? t('restock', lang) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{money(Number(i.price) * Number(i.quantity))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('reason', lang)}</p>
              {[d.reason, d.notes].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-gray-100">
              {canCreate && String(d.status).toLowerCase() === 'pending' && <><Button loading={busy} onClick={() => act(() => salesService.approveReturn(d.id), 'return_approved')}>{t('approve', lang)}</Button><Button variant="danger" onClick={() => setReject(d)}>{t('reject', lang)}</Button></>}
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>

      <FormModal isOpen={!!reject} onClose={() => setReject(null)} size="sm" title={t('reject', lang)}>
        <div className="space-y-3"><Textarea rows={3} label={t('reason', lang)} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-3"><Button variant="danger" loading={busy} onClick={() => act(() => salesService.rejectReturn(reject.id, reason), 'return_rejected')}>{t('reject', lang)}</Button><Button variant="secondary" onClick={() => setReject(null)}>{t('ui_cancel', lang)}</Button></div></div>
      </FormModal>
    </MainLayout>
  );
}
