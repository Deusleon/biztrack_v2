// FILE PATH: frontend/src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import MainLayout from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePreferences } from '../contexts/PreferencesContext';
import useLiveRefresh from '../hooks/useLiveRefresh';
import { dashboardService } from '../services/api';
import { Button } from '../components/ui';
import { t } from '../utils/i18n';

const num = (v) => Number(v) || 0;
const pct = (now, before) => (num(before) === 0 ? (num(now) > 0 ? 100 : 0) : ((num(now) - num(before)) / num(before)) * 100);

function Kpi({ title, value, sub, change, to }) {
  const body = (
    <div className="bg-white p-5 rounded shadow h-full">
      <p className="text-sm text-gray-500 text-left">{title}</p>
      <p className="text-2xl font-bold text-gray-900 text-left mt-1">{value}</p>
      <div className="flex items-center justify-between mt-1 text-xs">
        <span className="text-gray-500">{sub}</span>
        {change !== undefined && <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%</span>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full hover:opacity-90">{body}</Link> : body;
}

const QUICK = [
  { label: 'invoice_sale', to: '/sales/invoice', permission: 'create_invoice' },
  { label: 'products', to: '/inventory/products', permission: 'view_products' },
  { label: 'customers', to: '/sales/customers', permission: 'view_customers' },
  { label: 'purchase_orders', to: '/purchases/orders', permission: 'view_purchase_orders' },
  { label: 'expenses', to: '/expenses', permission: 'view_expenses' },
  { label: 'sales_reports', to: '/reports/sales', permission: 'view_sales_reports' },
];

export default function Dashboard() {
  const { user, can } = useAuth();
  const { currentStore } = useStore();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const { formatMoney } = usePreferences();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Everyone has a dashboard; only people who may see the money figures get the stats.
  const canSeeStats = can('view_dashboard') || can('view_sales_records') || can('view_sales_reports');

  const load = useCallback(async () => {
    if (!canSeeStats) { setLoading(false); return; }
    try { setLoading(true); const res = await dashboardService.getStats(); setStats(res.data); }
    catch (err) { showError(err.message); }
    finally { setLoading(false); }
  }, [canSeeStats, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['newSale', 'saleCreated', 'saleUpdated', 'expenseCreated'], load);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('good_morning', lang) : hour < 17 ? t('good_afternoon', lang) : t('good_evening', lang);
  const quick = QUICK.filter((q) => can(q.permission));

  const today = stats?.todayStats || {}; const yesterday = stats?.yesterdayStats || {}; const month = stats?.monthStats || {};
  const trend = (stats?.revenueTrend || []).map((r) => ({ ...r, revenue: num(r.revenue ?? r.total ?? r.amount) }));

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{currentStore?.name}</p>
          </div>
          {canSeeStats && <Button variant="secondary" mobileLabel={t('ui_refresh', lang)} onClick={load} loading={loading}>{t('ui_refresh', lang)}</Button>}
        </div>

        {canSeeStats && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi title={t('todays_sales', lang)} value={formatMoney(num(today.revenue))} sub={`${num(today.sales_count)} ${t('sales', lang)}`} change={pct(today.revenue, yesterday.revenue)} to="/sales/history" />
              <Kpi title={t('this_month', lang)} value={formatMoney(num(month.revenue))} sub={`${num(month.sales_count)} ${t('sales', lang)}`} to="/sales/history" />
              <Kpi title={t('amount_due', lang)} value={formatMoney(num(today.amount_due))} sub={t('today', lang)} to="/sales/debits" />
              <Kpi title={t('expenses', lang)} value={formatMoney(num(month.expenses))} sub={t('this_month', lang)} to="/expenses" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded shadow xl:col-span-2">
                <h2 className="text-sm font-semibold text-gray-700 text-left mb-3">{t('revenue_trend', lang)}</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey={trend[0]?.date !== undefined ? 'date' : 'label'} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(v) => formatMoney(v)} />
                      <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-5 rounded shadow">
                <h2 className="text-sm font-semibold text-gray-700 text-left mb-3">{t('payment_method_breakdown', lang)}</h2>
                {(stats?.paymentBreakdown || []).length === 0 && <p className="text-sm text-gray-400">{t('ui_nothing_yet', lang)}</p>}
                <ul className="space-y-2">
                  {(stats?.paymentBreakdown || []).map((p, i) => (
                    <li key={i} className="flex justify-between text-sm"><span className="capitalize text-gray-600">{p.payment_method || p.method}</span><span className="font-medium">{formatMoney(num(p.total ?? p.amount))}</span></li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded shadow">
                <div className="flex justify-between items-center mb-3"><h2 className="text-sm font-semibold text-gray-700">{t('ui_recent_sales', lang)}</h2><Link to="/sales/history" className="text-xs text-primary hover:underline">{t('view_all', lang)}</Link></div>
                {(stats?.recentSales || []).length === 0 && <p className="text-sm text-gray-400 text-left">{t('ui_nothing_yet', lang)}</p>}
                <ul className="divide-y divide-gray-100">
                  {(stats?.recentSales || []).map((s, i) => (
                    <li key={s.id || i} className="py-2 flex justify-between text-sm"><span className="text-gray-700 truncate">{s.customer_name || s.invoice_number || s.id}</span><span className="font-medium">{formatMoney(num(s.total_amount ?? s.total ?? s.net_amount))}</span></li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-5 rounded shadow">
                <div className="flex justify-between items-center mb-3"><h2 className="text-sm font-semibold text-gray-700">{t('top_products', lang)}</h2><Link to="/inventory/products" className="text-xs text-primary hover:underline">{t('view_all', lang)}</Link></div>
                {(stats?.topProducts || []).length === 0 && <p className="text-sm text-gray-400 text-left">{t('ui_nothing_yet', lang)}</p>}
                <ul className="divide-y divide-gray-100">
                  {(stats?.topProducts || []).map((p, i) => (
                    <li key={p.id || i} className="py-2 flex justify-between text-sm"><span className="text-gray-700 truncate">{p.name || p.product_name}</span><span className="font-medium">{num(p.total_quantity ?? p.quantity ?? p.qty)}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        {quick.length > 0 && (
          <div className="bg-white p-5 rounded shadow">
            <h2 className="text-sm font-semibold text-gray-700 text-left mb-3">{t('quick_actions', lang)}</h2>
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => <Link key={q.to} to={q.to} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-primary-10 hover:border-primary">{t(q.label, lang)}</Link>)}
            </div>
          </div>
        )}
        {!canSeeStats && quick.length === 0 && <p className="text-sm text-gray-500">{t('no_permissions', lang)}</p>}
      </div>
    </MainLayout>
  );
}
