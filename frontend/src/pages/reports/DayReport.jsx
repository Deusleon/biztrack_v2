// FILE PATH: frontend/src/pages/reports/DayReport.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { reportService } from '../../services/api';
import { Button, DataTable, DatePicker } from '../../components/ui';
import { formatValue, labelOf, kindOf } from './format';
import { t } from '../../utils/i18n';

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/** One day's takings: totals, how people paid, and every sale of the day (with profit). */
export default function DayReport() {
  const { showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const [date, setDate] = useState(today());
  const [state, setState] = useState({ loading: true, r: null });
  useEffect(() => {
    let live = true; setState((s) => ({ ...s, loading: true }));
    reportService.get('/day-report', { date }).then((r) => { if (live) setState({ loading: false, r }); }).catch((err) => { if (live) { setState({ loading: false, r: null }); showError(err.message); } });
    return () => { live = false; };
  }, [date, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (k, v) => formatValue(k, v, { settings, lang });
  const r = state.r; const tx = r?.transactions || []; const pay = r?.payment_breakdown || [];
  const txCols = ['invoice_number', 'sales_date', 'cashier_name', 'total_items', 'total_discount', 'total_amount', 'total_cost', 'profit'];
  const columns = txCols.map((k) => ({ key: k, label: labelOf(k, lang), nowrap: true, align: ['money', 'number'].includes(kindOf(k)) ? 'right' : 'left', render: (x) => fmt(k, x[k]) }));
  const exportRows = useMemo(() => tx.map((x, i) => ({ __no: `${i + 1}.`, ...Object.fromEntries(txCols.map((k) => [k, fmt(k, x[k])])) })), [tx, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('day_report', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('day_report_description', lang)}</p></div>
          <div className="flex items-end gap-2"><DatePicker value={date} onChange={(e) => e.target.value && setDate(e.target.value)} placeholder={t('date', lang)} /><Button variant="secondary" onClick={() => setDate(today())}>{t('today', lang)}</Button><ExportMenu rows={exportRows} columns={[{ key: '__no', title: 'no.', width: '45px' }, ...txCols.map((k) => ({ key: k, title: k }))]} title="day_report" orientation="landscape" fromDate={date} toDate={date} disabled={state.loading || exportRows.length === 0} /></div>
        </div>
        {r?.summary && <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Object.entries(r.summary).map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{labelOf(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1">{fmt(k, v)}</p></div>)}</div>}
        {pay.length > 0 && <div className="bg-white p-4 rounded shadow text-left"><h2 className="text-sm font-semibold text-gray-700 mb-2">{t('payment_method_breakdown', lang)}</h2><ul className="divide-y divide-gray-100 text-sm">{pay.map((p) => <li key={p.payment_method} className="py-1.5 flex justify-between"><span>{fmt('payment_method', p.payment_method)} <span className="text-gray-400">({p.transaction_count})</span></span><b>{fmt('total_amount', p.total_amount)}</b></li>)}</ul></div>}
        <DataTable columns={columns} data={tx.map((x, i) => ({ ...x, __i: i }))} loading={state.loading} rowId="__i" emptyMessage={t('ui_nothing_yet', lang)} />
      </div>
    </MainLayout>
  );
}
