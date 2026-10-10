// FILE PATH: frontend/src/pages/reports/ReportPage.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import MainLayout from '../../components/MainLayout';
import ExportMenu from '../../components/ExportMenu';
import ExplainReportPanel from '../../components/ExplainReportPanel';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { usePersistedState } from '../../hooks/usePersistedState';
import { reportService, categoryService } from '../../services/api';
import { DataTable, Input, Select, DatePicker } from '../../components/ui';
import { useAllProducts } from '../purchases/common';
import { REPORT_GROUPS, FILTER_OPTIONS } from './catalog';
import { kindOf, columnsFor, formatValue, labelOf } from './format';
import { t } from '../../utils/i18n';

const PAGE = 50;
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const PRESETS = {
  today: () => [iso(new Date()), iso(new Date())],
  yesterday: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [iso(d), iso(d)]; },
  this_week: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [iso(s), iso(d)]; },
  this_month: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)]; },
  last_month: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]; },
  this_year: () => { const d = new Date(); return [iso(new Date(d.getFullYear(), 0, 1)), iso(d)]; },
};

export default function ReportPage({ group }) {
  const g = REPORT_GROUPS[group];
  const { can } = useAuth();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const products = useAllProducts();
  const allowed = useMemo(() => g.reports.filter((r) => (r.perms ? r.perms.some(can) : can(r.perm))), [g, can]);
  const [reportId, setReportId] = usePersistedState('report', allowed[0]?.id);
  const report = allowed.find((r) => r.id === reportId) || allowed[0];
  const [filters, setFilters] = usePersistedState('rfilters', { startDate: PRESETS.this_month()[0], endDate: PRESETS.this_month()[1] });
  const [cats, setCats] = useState([]);
  const [state, setState] = useState({ loading: false, data: [], summary: null });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const seq = useRef(0);
  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  useEffect(() => { if (report?.filters.includes('categoryId')) categoryService.getAll({ limit: 500 }).then((r) => setCats(r.data)).catch(() => {}); }, [report?.id, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // run the report whenever the report, the filters or the store change (a moment after the last keystroke)
  useEffect(() => {
    if (!report) return undefined;
    const path = report.paths ? (report.paths.find(([, p]) => can(p)) || report.paths[0])[0] : report.path;
    const params = {};
    if (report.dates) { params.startDate = filters.startDate; params.endDate = filters.endDate; }
    report.filters.forEach((f) => { const o = FILTER_OPTIONS[f]; const v = filters[f] ?? o?.default; if (v) params[o?.param || f] = v; });
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try { setState((s) => ({ ...s, loading: true })); const r = await reportService.get(path, params); if (mine === seq.current) setState({ loading: false, data: r.data || [], summary: r.summary || null }); }
      catch (err) { if (mine === seq.current) { setState({ loading: false, data: [], summary: null }); showError(err.message); } }
    }, 250);
    return () => clearTimeout(timer);
  }, [report?.id, filters, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = useMemo(() => columnsFor(state.data), [state.data]);
  const fmt = (k, v) => formatValue(k, v, { settings, lang });
  const rows = useMemo(() => state.data.map((r, i) => ({ ...r, __i: i })), [state.data]);
  const shown = useMemo(() => { const q = search.trim().toLowerCase(); return q ? rows.filter((r) => cols.some((k) => fmt(k, r[k]).toLowerCase().includes(q))) : rows; }, [rows, search, cols, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageRows = shown.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const columns = cols.map((k) => ({ key: k, label: labelOf(k, lang), nowrap: true, align: ['money', 'number', 'percent'].includes(kindOf(k)) ? 'right' : 'left', render: (r) => fmt(k, r[k]) }));
  const exportCols = [{ key: '__no', title: 'no.', width: '45px' }, ...cols.map((k) => ({ key: k, title: k }))];
  const exportRows = useMemo(() => shown.map((r, i) => ({ __no: `${i + 1}.`, ...Object.fromEntries(cols.map((k) => [k, fmt(k, r[k])])) })), [shown, cols, settings, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = state.summary ? Object.entries(state.summary).filter(([k, v]) => v !== null && typeof v !== 'object' && typeof v !== 'boolean' && !k.startsWith('has_')) : [];
  const chartData = useMemo(() => (report?.chart ? [...state.data].sort((a, b) => String(a[report.chart.x]).localeCompare(String(b[report.chart.x]))).map((r) => ({ x: String(r[report.chart.x]).slice(0, 10), ...Object.fromEntries(report.chart.ys.map((y) => [y, Number(r[y]) || 0])) })) : []), [state.data, report]);
  const desc = report ? t(`${report.label}_description`, lang) : '';

  if (!report) return <MainLayout><p className="text-sm text-gray-500">{t('no_permissions', lang)}</p></MainLayout>;
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t(g.title, lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t(g.desc, lang)}</p></div>
          <div className="flex items-center gap-2">
            {['sales', 'profit', 'inventory'].includes(group) && can('ai_explain_reports') && <ExplainReportPanel reportType={group} reportKey={report.id} filters={{ ...(report.dates ? { startDate: filters.startDate, endDate: filters.endDate } : {}), ...Object.fromEntries(report.filters.filter((f) => filters[f]).map((f) => [FILTER_OPTIONS[f]?.param || f, filters[f]])) }} />}
            <ExportMenu rows={exportRows} columns={exportCols} title={report.label} orientation={cols.length > 6 ? 'landscape' : 'portrait'} fromDate={report.dates ? filters.startDate : null} toDate={report.dates ? filters.endDate : null} disabled={state.loading || exportRows.length === 0} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">{allowed.map((r) => <button key={r.id} type="button" onClick={() => { setReportId(r.id); setSearch(''); setPage(1); }} className={`px-3 py-1.5 text-sm rounded border ${r.id === report.id ? 'border-primary bg-primary-10 text-primary font-medium' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>{t(r.label, lang)}</button>)}</div>
        {desc && desc !== `${report.label}_description` && <p className="text-xs text-gray-500 text-left">{desc}</p>}

        <div className="bg-white p-4 rounded shadow space-y-3">
          {report.dates && (
            <div className="flex flex-wrap gap-2 items-end">
              {Object.keys(PRESETS).map((p) => <button key={p} type="button" className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50" onClick={() => { const [a, b] = PRESETS[p](); setFilters((f) => ({ ...f, startDate: a, endDate: b })); setPage(1); }}>{t(p, lang)}</button>)}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {report.dates && <><DatePicker label={t('start_date', lang)} value={filters.startDate || ''} onChange={(e) => setF('startDate', e.target.value)} /><DatePicker label={t('end_date', lang)} align="right" value={filters.endDate || ''} onChange={(e) => setF('endDate', e.target.value)} /></>}
            {report.filters.map((f) => {
              if (f === 'categoryId') return <Select key={f} searchable label={t('category', lang)} value={filters.categoryId || ''} onChange={(e) => setF('categoryId', e.target.value)} options={[{ value: '', label: t('all_categories', lang) }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />;
              if (f === 'productId') return <Select key={f} searchable label={t('product_name', lang)} value={filters.productId || ''} onChange={(e) => setF('productId', e.target.value)} options={[{ value: '', label: t('all_products', lang) }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />;
              const o = FILTER_OPTIONS[f];
              return <Select key={f} label={t(o.label, lang)} value={filters[f] ?? o.default ?? ''} onChange={(e) => setF(f, e.target.value)} options={[...(o.required ? [] : [{ value: '', label: t('all', lang) }]), ...o.options.map((x) => ({ value: x, label: t(x.replace(/-/g, '_'), lang) === x.replace(/-/g, '_') ? x : t(x.replace(/-/g, '_'), lang) }))]} />;
            })}
          </div>
        </div>

        {cards.length > 0 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cards.slice(0, 12).map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{labelOf(k, lang)}</p><p className="text-lg font-bold text-gray-900 mt-1 break-words">{fmt(k, v)}</p></div>)}</div>}

        {report.chart && chartData.length > 0 && (
          <div className="bg-white p-4 rounded shadow"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="x" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={70} /><Tooltip formatter={(v) => fmt('total_amount', v)} /><Legend formatter={(v) => labelOf(v, lang)} />{report.chart.ys.map((y, i) => <Line key={y} type="monotone" dataKey={y} stroke={i ? '#16a34a' : 'var(--color-primary)'} strokeWidth={2} dot={chartData.length < 40} />)}</LineChart></ResponsiveContainer></div></div>
        )}

        <div className="bg-white p-4 rounded shadow flex items-center justify-between gap-3 flex-wrap"><div className="min-w-[14rem] flex-1 max-w-sm"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('ui_search_placeholder', lang)} /></div><span className="text-sm text-gray-500">{t('ui_records_found', lang, { count: shown.length })}</span></div>
        <DataTable columns={columns} data={pageRows} loading={state.loading} rowId="__i" emptyMessage={search ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={{ currentPage: Math.min(page, pages), totalPages: pages, totalItems: shown.length, limit: PAGE }} onPageChange={setPage} />
      </div>
    </MainLayout>
  );
}
