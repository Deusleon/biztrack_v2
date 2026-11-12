// FILE PATH: frontend/src/pages/DefaultDashboard.jsx
//
// What a person sees on the Dashboard when their role does NOT include the money figures (view_dashboard / sales records /
// sales reports). It is shown INSIDE the Dashboard page (which already draws the layout and the greeting), so nobody lands on
// an "access denied" page. It offers only the shortcuts that the person's own permissions open — the same permissions the
// menu uses, so nothing here leads to a closed door.
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ICON_PATHS } from '../utils/navigation';
import { t } from '../utils/i18n';

// label = translation key · icon = a key of ICON_PATHS · permission = the one the menu entry needs
const ACTIONS = [
  { label: 'invoice_sale', to: '/sales/invoice', icon: 'cart', permission: 'create_invoice' },
  { label: 'sales_history', to: '/sales/history', icon: 'receipt', permission: 'view_sales_records' },
  { label: 'customers', to: '/sales/customers', icon: 'users', permission: 'view_customers' },
  { label: 'products', to: '/inventory/products', icon: 'box', permission: 'view_products' },
  { label: 'current_stock', to: '/inventory/current-stock', icon: 'layers', permission: 'view_current_stock' },
  { label: 'purchase_orders', to: '/purchases/orders', icon: 'truck', permission: 'view_purchase_orders' },
  { label: 'expenses', to: '/expenses', icon: 'cash', permission: 'view_expenses' },
  { label: 'sales_reports', to: '/reports/sales', icon: 'chart', permission: 'view_sales_reports' },
];

const Svg = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);

export default function DefaultDashboard() {
  const { can } = useAuth();
  const { lang } = useLanguage();
  const actions = ACTIONS.filter((a) => can(a.permission));
  const dateLabel = new Date().toLocaleDateString(lang === 'sw' ? 'sw-TZ' : undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded shadow flex items-start gap-3 text-left">
        <span className="shrink-0 mt-0.5 text-primary"><Svg d={ICON_PATHS.help} className="w-5 h-5" /></span>
        <div className="min-w-0">
          <p className="text-sm text-gray-700">{t('limited_dashboard_notice', lang)}</p>
          <p className="text-xs text-gray-400 mt-1">{dateLabel}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded shadow">
        <h2 className="text-sm font-semibold text-gray-700 text-left">{t('quick_actions', lang)}</h2>
        <p className="text-xs text-gray-500 text-left mt-0.5 mb-4">{t('limited_dashboard_subtitle', lang)}</p>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">{t('no_quick_actions', lang)}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {actions.map((a) => (
              <Link key={a.to} to={a.to} className="group flex flex-col items-center justify-center gap-2 p-4 rounded border border-gray-200 text-center hover:bg-primary-10 hover:border-primary">
                <span className="w-10 h-10 rounded-full bg-primary-10 text-primary flex items-center justify-center"><Svg d={ICON_PATHS[a.icon] || ICON_PATHS.box} /></span>
                <span className="text-sm font-medium text-gray-700 leading-tight">{t(a.label, lang)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
