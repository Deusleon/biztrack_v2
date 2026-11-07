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
                <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/new-password" element={<NewPassword />} />

                  <Route element={<ProtectedRoute />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    {paths.map((p) => <Route key={p} path={p} element={READY[p] || <ComingSoon />} />)}
                    <Route path="/messaging" element={<Navigate to="/messaging/recent" replace />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
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
