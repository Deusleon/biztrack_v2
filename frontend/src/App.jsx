// FILE PATH: frontend/src/App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { StoreProvider } from './contexts/StoreContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { StoreSettingsProvider } from './contexts/StoreSettingsContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import ProtectedRoute from './components/ProtectedRoute';
import { NotificationProvider } from './contexts/NotificationContext';
import { IdleLockProvider } from './contexts/IdleLockContext';
import Login from './pages/auth/Login';
const Register = lazy(() => import('./pages/auth/Register'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const NewPassword = lazy(() => import('./pages/auth/NewPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
import ComingSoon from './pages/ComingSoon';
const ProductCategories = lazy(() => import('./pages/categories/ProductCategories'));
const PriceCategories = lazy(() => import('./pages/categories/PriceCategories'));
const Customers = lazy(() => import('./pages/sales/Customers'));
const Products = lazy(() => import('./pages/inventory/Products'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const Invoice = lazy(() => import('./pages/sales/Invoice'));
const Pending = lazy(() => import('./pages/sales/Pending'));
const OrderPreview = lazy(() => import('./pages/sales/OrderPreview'));
const History = lazy(() => import('./pages/sales/History'));
const Receipt = lazy(() => import('./pages/sales/Receipt'));
const Returns = lazy(() => import('./pages/sales/Returns'));
const Debits = lazy(() => import('./pages/sales/Debits'));
const PurchaseOrders = lazy(() => import('./pages/purchases/Orders'));
const GoodsReceived = lazy(() => import('./pages/purchases/GoodsReceived'));
const Suppliers = lazy(() => import('./pages/purchases/Suppliers'));
const SupplierInvoices = lazy(() => import('./pages/purchases/Invoices'));
const SupplierPayments = lazy(() => import('./pages/purchases/Payments'));
const SupplierReturns = lazy(() => import('./pages/purchases/Returns'));
const CurrentStock = lazy(() => import('./pages/inventory/CurrentStock'));
const StockValue = lazy(() => import('./pages/inventory/StockValue'));
const StockValueHistory = lazy(() => import('./pages/inventory/StockValueHistory'));
const PriceList = lazy(() => import('./pages/inventory/PriceList'));
const StockAdjustment = lazy(() => import('./pages/inventory/StockAdjustment'));
const StockCount = lazy(() => import('./pages/inventory/StockCount'));
const StockTransfer = lazy(() => import('./pages/inventory/StockTransfer'));
const ImportExport = lazy(() => import('./pages/inventory/ImportExport'));
const Expenses = lazy(() => import('./pages/expenses/Expenses'));
const ReportPage = lazy(() => import('./pages/reports/ReportPage'));
const DayReport = lazy(() => import('./pages/reports/DayReport'));
const NetProfit = lazy(() => import('./pages/reports/NetProfit'));
const Roles = lazy(() => import('./pages/users/Roles'));
const Users = lazy(() => import('./pages/users/Users'));
const Permissions = lazy(() => import('./pages/users/Permissions'));
const Stores = lazy(() => import('./pages/stores/Stores'));
const Configuration = lazy(() => import('./pages/settings/Configuration'));
const Security = lazy(() => import('./pages/settings/Security'));
const Appearance = lazy(() => import('./pages/settings/Appearance'));
const Uploads = lazy(() => import('./pages/settings/Uploads'));
const Notifications = lazy(() => import('./pages/settings/Notifications'));
const LockScreen = lazy(() => import('./pages/LockScreen'));
const MsgRecent = lazy(() => import('./pages/messaging/Recent'));
const MsgContacts = lazy(() => import('./pages/messaging/Contacts'));
const MsgGroups = lazy(() => import('./pages/messaging/Groups'));
const MsgTemplates = lazy(() => import('./pages/messaging/Templates'));
const MsgAccount = lazy(() => import('./pages/messaging/Account'));
const SubscriptionPage = lazy(() => import('./pages/subscription/Subscription'));
const SupportAdmin = lazy(() => import('./pages/support/SupportAdmin'));
const UserManual = lazy(() => import('./pages/UserManual'));
const BizTrackAI = lazy(() => import('./pages/ai/BizTrackAI'));
const Tools = lazy(() => import('./pages/settings/Tools'));
const Integrations = lazy(() => import('./pages/settings/Integrations'));
const ImportExportPage = lazy(() => import('./pages/inventory/ImportExport'));
import NotFound from './pages/NotFound';
import { NAV_SECTIONS } from './utils/navigation';

/**
 * Pages already moved to the new BizTrack. Everything else in the menu opens ComingSoon until its turn
 * (MIGRATION_CHECKLIST.md lists every page and where it stands).
 */
const READY = {
  '/categories/products': <ProductCategories />,
  '/categories/prices': <PriceCategories />,
  '/sales/customers': <Customers />,
  '/inventory/products': <Products />,
  '/profile': <Profile />,
  '/sales/invoice': <Invoice />,
  '/sales/pending': <Pending />,
  '/sales/pending/preview': <OrderPreview />,
  '/sales/history': <History />,
  '/sales/receipt': <Receipt />,
  '/sales/returns': <Returns />,
  '/sales/debits': <Debits />,
  '/purchases/orders': <PurchaseOrders />,
  '/purchases/goods-received': <GoodsReceived />,
  '/purchases/suppliers': <Suppliers />,
  '/purchases/invoices': <SupplierInvoices />,
  '/purchases/payments': <SupplierPayments />,
  '/purchases/returns': <SupplierReturns />,
  '/inventory/current-stock': <CurrentStock />,
  '/inventory/stock-value': <StockValue />,
  '/inventory/stock-value-history': <StockValueHistory />,
  '/inventory/pricelist': <PriceList />,
  '/inventory/adjustment': <StockAdjustment />,
  '/inventory/stock-count': <StockCount />,
  '/inventory/stock-transfer': <StockTransfer />,
  '/inventory/import-export': <ImportExport />,
  '/expenses': <Expenses />,
  '/reports/sales': <ReportPage group="sales" />,
  '/reports/purchases': <ReportPage group="purchases" />,
  '/reports/inventory': <ReportPage group="inventory" />,
  '/reports/profit': <ReportPage group="profit" />,
  '/reports/expenses': <ReportPage group="expenses" />,
  '/reports/net-profit': <NetProfit />,
  '/reports/day-report': <DayReport />,
  '/users/all': <Users />,
  '/users/roles': <Roles />,
  '/users/permissions': <Permissions />,
  '/stores': <Stores />,
  '/settings/configurations': <Configuration />,
  '/settings/security': <Security />,
  '/settings/appearance': <Appearance />,
  '/settings/uploads': <Uploads />,
  '/settings/notifications': <Notifications />,
  '/settings/tools': <Tools />,
  '/subscription': <SubscriptionPage />,
  '/support/admin': <SupportAdmin />,
  '/user-manual': <UserManual />,
  '/biztrack-ai': <BizTrackAI />,
  '/messaging/recent': <MsgRecent />,
  '/messaging/contacts': <MsgContacts />,
  '/messaging/groups': <MsgGroups />,
  '/messaging/templates': <MsgTemplates />,
  '/messaging/account': <MsgAccount />,
  '/settings/integration': <Integrations />,
  '/settings/bulk-operations': <ImportExportPage bulk />,
};

const EXTRA_ROUTES = ['/sales/pending/preview', '/sales/receipt', '/reports/day-report', '/profile', '/biztrack-ai', '/support/admin'];

const Loading = () => <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

function App() {
  const paths = [...new Set([...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to)), ...EXTRA_ROUTES])].filter((p) => p !== '/dashboard');

  return (
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <SubscriptionProvider>
            <ThemeProvider>
              <StoreSettingsProvider>
              <PreferencesProvider>
              <NotificationProvider>
              <IdleLockProvider>
                <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/new-password" element={<NewPassword />} />

                  <Route element={<ProtectedRoute />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/lock" element={<LockScreen />} />
                    {paths.map((p) => <Route key={p} path={p} element={READY[p] || <ComingSoon />} />)}
                    <Route path="/messaging" element={<Navigate to="/messaging/recent" replace />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </IdleLockProvider>
              </NotificationProvider>
              </PreferencesProvider>
              </StoreSettingsProvider>
            </ThemeProvider>
          </SubscriptionProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
