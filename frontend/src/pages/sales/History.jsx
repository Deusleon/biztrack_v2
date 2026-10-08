// FILE PATH: frontend/src/pages/sales/History.jsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { salesService } from '../../services/api';
import useServerList from '../../hooks/useServerList';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { DataTable, Button, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { FilterBar, StatusBadge, DetailGrid, toPaging, dateOnly } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { generateDeliveryNotePDF } from '../../utils/deliveryNotePdf';
import { t } from '../../utils/i18n';

const fetchSales = async ({ page, limit, search, saleType, startDate, endDate }) => {
  const r = await salesService.history({ page, limit, search: search || undefined, saleType: saleType || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  return { data: r.sales || [], pagination: toPaging(r.pagination, limit), summary: r.summary };
};

export default function History() {
  const { can } = useAuth();
  const { showError, showSuccess } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const list = useServerList({ fetcher: fetchSales, initialFilters: { search: '', saleType: '', startDate: '', endDate: '' } });
  useLiveRefresh(['newSale', 'saleCreated', 'sales_return'], list.reload);
  const [detail, setDetail] = useState(null);
  const money = (v) => formatCurrency(Number(v) || 0, settings);

  const open = async (s, then) => {
    try { const d = await salesService.saleDetails(s.invoice_number); if (then) then(d); else setDetail(d); }
    catch (err) { showError(err.message); }
  };
  const receipt = (s) => open(s, (d) => navigate('/sales/receipt', { state: { saleData: { ...d, invoice_number: s.invoice_number, items: d.items, paymentInfo: d.payment, customerInfo: { name: s.customer_name, phone: s.customer_phone } } } }));

  // Delivery note (A4, no prices) — same document the original produced
  const deliveryNote = (s) => open(s, (d) => {
    try {
      const st = settings || {};
      generateDeliveryNotePDF({
        businessInfo: { name: st.businessName || 'BizTrack', address: st.address || '', phone: st.phone || '', email: st.email || '', tin: st.tinNumber || '', logo: st.logo?.preview || '/icon-192.png' },
        orderInfo: { invoice_number: s.invoice_number, cashierName: s.cashier_name },
        customerInfo: { name: s.customer_name || t('walk_in', lang), phone: s.customer_phone || '' },
        items: (d.items || []).map((i) => ({ name: i.name, quantity: i.quantity })), settings: { ...st },
      }, 'A4').save(`DeliveryNote-${s.invoice_number}.pdf`);
      showSuccess('delivery_note_downloaded');
    } catch (err) { console.error(err); showError(t('something_went_wrong', lang)); }
  });

  const columns = [
    { key: 'invoice_number', label: t('invoice_number', lang), render: (s) => <span className="inline-flex items-center gap-2"><span className="font-medium text-gray-900">#{s.invoice_number}</span>{s.was_returned && <StatusBadge value={Number(s.total_amount) <= 0.005 ? 'returned' : 'partly_returned'} />}</span> },
    { key: 'sales_date', label: t('date', lang), render: (s) => dateOnly(s.sales_date || s.created_at) },
    { key: 'customer_name', label: t('customer', lang), render: (s) => s.customer_name || t('walk_in', lang) },
    { key: 'sale_type', label: t('type', lang), render: (s) => <StatusBadge value={s.sale_type} /> },
    { key: 'total_amount', label: t('total', lang), align: 'right', render: (s) => money(s.total_amount) },
    { key: 'amount_paid', label: t('amount_paid', lang), align: 'right', render: (s) => money(s.amount_paid) },
    { key: 'amount_due', label: t('amount_due', lang), align: 'right', render: (s) => <span className={Number(s.amount_due) > 0 ? 'text-red-600' : ''}>{money(s.amount_due)}</span> },
    { key: 'payment_method', label: t('payment_method', lang), render: (s) => t(s.payment_method, lang) },
    { key: 'cashier_name', label: t('cashier', lang), render: (s) => s.cashier_name || '—' },
  ];

  const exportCols = [{ key: 'index', title: 'no.', width: '45px' }, { key: 'invoice_number', title: 'invoice_number' }, { key: 'date', title: 'date' }, { key: 'customer_name', title: 'customer' }, { key: 'sale_type', title: 'type' }, { key: 'total_amount', title: 'total' }, { key: 'amount_paid', title: 'amount_paid' }, { key: 'amount_due', title: 'amount_due' }];
  const toRows = (rows, offset = 0) => rows.map((s, i) => ({ index: `${offset + i + 1}.`, invoice_number: s.invoice_number, date: dateOnly(s.sales_date || s.created_at), customer_name: s.customer_name || t('walk_in', lang), sale_type: t(s.sale_type, lang), total_amount: money(s.total_amount), amount_paid: money(s.amount_paid), amount_due: money(s.amount_due) }));
  const exportRows = useMemo(() => toRows(list.rows, (list.pagination.currentPage - 1) * list.pagination.limit), [list.rows, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadAllRows = async () => { const all = []; let page = 1; let pages = 1; do { const r = await fetchSales({ ...list.filters, page, limit: 100 }); all.push(...r.data); pages = r.pagination.totalPages; page += 1; } while (page <= pages && page <= 200); return toRows(all); };

  const d = detail; const pay = d?.payment || {};
  const doneReturns = (d?.returns || []).filter((r) => ['completed', 'approved'].includes(String(r.status).toLowerCase()));
  const fullyReturned = doneReturns.length > 0 && Number(pay.total_amount) <= 0.005;
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('sales_history', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('manage_sales_history', lang)}</p></div>
          <div className="flex gap-2"><ExportMenu rows={exportRows} columns={exportCols} title="sales_history" loadRows={loadAllRows} orientation="landscape" disabled={list.loading || list.rows.length === 0} />
            {can('create_invoice') && <Button onClick={() => navigate('/sales/invoice')}>{t('new_sale', lang)}</Button>}</div>
        </div>
        <FilterBar list={list} statusKey="saleType" statusOptions={['cash', 'credit']} />
        <DataTable columns={columns} data={list.rows} loading={list.loading} rowId="invoice_number" emptyMessage={list.hasFilters ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={list.pagination} onPageChange={list.setPage}
          renderActions={(s) => <RowActions actions={[
            { label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(s) },
            { label: t('receipt', lang), icon: ACTION_ICONS.print, onClick: () => receipt(s) },
            { label: t('delivery_note', lang), icon: ACTION_ICONS.download, onClick: () => deliveryNote(s) },
            { label: t('sales_return', lang), icon: ACTION_ICONS.edit, onClick: () => navigate('/sales/returns', { state: { invoiceNumber: s.invoice_number } }), hidden: !can('create_sales_return') },
          ]} />} />
      </div>

      <FormModal isOpen={!!d} onClose={() => setDetail(null)} size="xl" title={`${t('invoice', lang)} #${pay.invoice_number || ''}`}>
        {d && (
          <div className="space-y-5 text-left">
            {doneReturns.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">{t(fullyReturned ? 'invoice_returned' : 'invoice_partly_returned', lang)}</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {doneReturns.map((r) => <li key={r.return_number}>{r.return_number} · {dateOnly(r.completed_at || r.created_at)} · {t('returned_by', lang)}: {r.returned_by || '—'} · {money(r.refund_amount || r.total_amount)}</li>)}
                </ul>
              </div>
            )}
            <DetailGrid items={[
              [t('customer', lang), pay.customer_name || t('walk_in', lang)],
              [t('phone', lang), pay.customer_phone],
              [t('date', lang), dateOnly(pay.sales_date || pay.created_at)],
              [t('cashier', lang), pay.cashier_name],
              [t('type', lang), <StatusBadge value={pay.sale_type} />],
              [t('payment_method', lang), t(pay.payment_method, lang)],
              [t('amount_paid', lang), money(pay.amount_paid)],
              [t('amount_due', lang), <span className={Number(pay.amount_due) > 0 ? 'text-red-600' : 'text-green-700'}>{money(pay.amount_due)}</span>],
            ]} />
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500"><tr>
                  <th className="px-3 py-2.5 text-left font-medium">{t('product_name', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('quantity', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('price', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('discount', lang)}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('total', lang)}</th>
                </tr></thead>
                <tbody>{(d.items || []).map((i) => (
                  <tr key={i.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5">{i.name}</td>
                    <td className="px-3 py-2.5 text-right">{Number(i.quantity)}</td>
                    <td className="px-3 py-2.5 text-right">{money(i.price)}</td>
                    <td className="px-3 py-2.5 text-right">{money(i.discount)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{money(Number(i.price) * Number(i.quantity) - Number(i.discount || 0) * Number(i.quantity))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600 min-h-[4.5rem]">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{t('notes', lang)}</p>
                {pay.notes || '—'}
              </div>
              <div className="rounded-md border border-gray-200 px-4 py-3 space-y-1.5 text-sm">
                {[['subtotal', pay.subtotal], ['discount', pay.total_discount], ['tax', pay.total_vat]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-gray-500">{t(k, lang)}</span><span>{money(v)}</span></div>)}
                <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(pay.total_amount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('amount_paid', lang)}</span><span>{money(pay.amount_paid)}</span></div>
                <div className={`flex justify-between font-semibold ${Number(pay.amount_due) > 0 ? 'text-red-600' : 'text-green-700'}`}><span>{t('amount_due', lang)}</span><span>{money(pay.amount_due)}</span></div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-gray-100">
              <Button variant="secondary" onClick={() => { const s = { invoice_number: pay.invoice_number, customer_name: pay.customer_name, customer_phone: pay.customer_phone }; setDetail(null); navigate('/sales/receipt', { state: { saleData: { ...d, invoice_number: s.invoice_number, items: d.items, paymentInfo: d.payment, customerInfo: { name: s.customer_name, phone: s.customer_phone } } } }); }}>{t('receipt', lang)}</Button>
              <Button variant="secondary" onClick={() => deliveryNote({ invoice_number: pay.invoice_number, customer_name: pay.customer_name, customer_phone: pay.customer_phone, cashier_name: pay.cashier_name })}>{t('delivery_note', lang)}</Button>
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button>
            </div>
          </div>
        )}
      </FormModal>
    </MainLayout>
  );
}
