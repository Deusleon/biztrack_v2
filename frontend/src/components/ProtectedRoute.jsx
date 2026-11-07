// FILE PATH: frontend/src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { itemForPath, canOpen } from '../utils/navigation';
import PasswordExpired from '../pages/PasswordExpired';
import NoAccess from '../pages/NoAccess';
import SubscriptionLocked from '../pages/SubscriptionLocked';

const LOCKED_OK = ['/subscription', '/profile', '/user-manual'];

/**
 * Wraps every signed-in route. Sends the person to /login the moment they are not signed in, and decides —
 * before the page loads or asks the server for anything — whether they may see it:
 *   1. password expired      → only the "choose a new password" screen
 *   2. subscription lapsed   → only the Subscription page, profile and manual
 *   3. the page's permission → the menu entry's permission is the key to its door (hidden AND closed)
 * (The server checks every action again; this only stops people landing on screens that would just fail.)
 */
export default function ProtectedRoute() {
  const { isAuthenticated, user, can, permissions, loading } = useAuth();
  const { locked } = useSubscription();
  const { pathname } = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: { pathname } }} />;

  if (user?.password_change_required) return <PasswordExpired />;

  if (locked && !LOCKED_OK.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return can('view_subscription') ? <Navigate to="/subscription" replace /> : <SubscriptionLocked />;
  }

  const item = itemForPath(pathname);
  // Wait until the server has said what this person may do (cached from last time or just fetched).
  if (item && permissions.length > 0 && !canOpen(item, can)) return <NoAccess />;
  return <Outlet />;
}
