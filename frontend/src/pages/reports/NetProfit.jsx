// FILE PATH: frontend/src/pages/reports/NetProfit.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { reportService } from '../../services/api';
import { DatePicker } from '../../components/ui';
import { PRESETS } from './ReportPage';
import { formatValue, labelOf } from './format';
import { t } from '../../utils/i18n';

/** Revenue − cost of goods = gross profit; minus expenses = net profit, for a period. */
export default function NetProfit() {
  const { showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const [range, setRange] = useState(() => { const [a, b] = PRESETS.this_month(); return { startDate: a, endDate: b }; });
  const [state, setState] = useState({ loading: true, s: null });
  useEffect(() => {
    let live = true; setState((x) => ({ ...x, loading: true }));
    reportService.get('/net-profit', range).then((r) => { if (live) setState({ loading: false, s: r.summary }); }).catch((err) => { if (live) { setState({ loading: false, s: null }); showError(err.message); } });
    return () => { live = false; };
  }, [range, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = state.s; const fmt = (k, v) => formatValue(k, v, { settings, lang });
  const lines = s ? [['total_revenue', s.total_revenue], ['total_cost_of_goods_sold', -s.total_cost_of_goods_sold], ['gross_profit', s.gross_profit, true], ['total_expenses', -s.total_expenses], ['net_profit', s.net_profit, true]] : [];

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('net_profit_reports', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('net_profit_report_description', lang)}</p></div>
        <div className="bg-white p-4 rounded shadow space-y-3"><div className="flex flex-wrap gap-2">{Object.keys(PRESETS).map((p) => <button key={p} type="button" className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50" onClick={() => { const [a, b] = PRESETS[p](); setRange({ startDate: a, endDate: b }); }}>{t(p, lang)}</button>)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><DatePicker label={t('start_date', lang)} value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} /><DatePicker label={t('end_date', lang)} align="right" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} /></div></div>
        {state.loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {s && (<>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded shadow p-5"><ul className="divide-y divide-gray-100 text-sm">{lines.map(([k, v, strong]) => <li key={k} className={`py-2.5 flex justify-between ${strong ? 'font-bold text-base' : ''}`}><span className="text-gray-600">{labelOf(k, lang)}</span><span className={Number(v) < 0 ? 'text-red-600' : strong ? (Number(v) >= 0 ? 'text-green-700' : 'text-red-600') : ''}>{fmt('amount', v)}</span></li>)}<li className="py-2.5 flex justify-between text-gray-500"><span>{labelOf('net_profit_margin_percentage', lang)}</span><span>{fmt('net_profit_margin_percentage', s.net_profit_margin_percentage)}</span></li></ul></div>
          {(s.expenses_by_category || []).length > 0 && <div className="bg-white rounded shadow p-5 text-left"><h2 className="text-sm font-semibold text-gray-700 mb-2">{t('expenses', lang)}</h2><ul className="divide-y divide-gray-100 text-sm">{s.expenses_by_category.map((e, i) => <li key={i} className="py-1.5 flex justify-between"><span>{e.category}</span><b>{fmt('amount', e.total ?? e.total_amount ?? e.amount)}</b></li>)}</ul></div>}
          </div>
          <p className="text-xs text-gray-400 text-left">{labelOf('total_purchases', lang)}: {fmt('amount', s.total_purchases)}</p>
        </>)}
      </div>
    </MainLayout>
  );
}
