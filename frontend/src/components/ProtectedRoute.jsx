// FILE PATH: frontend/src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { guardForPath, canOpen } from '../utils/navigation';
import useDeveloperAccess from '../hooks/useDeveloperAccess';
import PasswordExpired from '../pages/PasswordExpired';
import NoAccess from '../pages/NoAccess';
import SubscriptionLocked from '../pages/SubscriptionLocked';
import Loader from './ui/Loader';

const LOCKED_OK = ['/subscription', '/profile', '/user-manual', '/support/admin'];

/**
 * Wraps every signed-in route. Sends the person to /login the moment they are not signed in, and decides —
 * before the page loads or asks the server for anything — whether they may see it:
 *   1. password expired      → only the "choose a new password" screen
 *   2. subscription lapsed   → only the Subscription page, profile and manual
 *   3. the page's permission → the menu entry's permission is the key to its door (hidden AND closed)
 * (The server checks every action again; this only stops people landing on screens that would just fail.)
 */
export default function ProtectedRoute() {
  const { isAuthenticated, user, can, permsReady, loading } = useAuth();
  const { locked } = useSubscription();
  const { isDeveloper, loading: developerLoading } = useDeveloperAccess();
  const { pathname } = useLocation();

  if (loading) return <Loader full />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: { pathname } }} />;

  if (user?.password_change_required) return <PasswordExpired />;

  if (locked && !LOCKED_OK.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (developerLoading) return <Loader full />;
    // The developer still reaches the subscription page, so they can extend a lapsed store.
    if (can('view_subscription') || isDeveloper) return <Navigate to="/subscription" replace />;
    return <SubscriptionLocked />;
  }

  const item = guardForPath(pathname);
  const needsGuard = !!(item && (item.permission || item.anyPermissions || item.developerOnly));
  // An empty permission list used to skip this check, so a role with nothing assigned could still open every address.
  if (needsGuard && (!permsReady || (item.developerOnly && developerLoading))) return <Loader full />;
  if (needsGuard && !canOpen(item, can, { developer: isDeveloper })) return <NoAccess />;
  return <Outlet />;
}
