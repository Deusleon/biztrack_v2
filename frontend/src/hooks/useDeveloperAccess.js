import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { integrationService } from '../services/api';

// One answer per signed-in person. The sidebar, the route guard and Configuration
// all ask; they should not each hit /integrations/access.
const cache = new Map();
const inflight = new Map();

function resolveAccess(userId) {
  if (cache.has(userId)) return Promise.resolve(cache.get(userId));
  if (!inflight.has(userId)) {
    inflight.set(
      userId,
      integrationService.access()
        .then(() => {
          cache.set(userId, true);
          return true;
        })
        .catch((err) => {
          // 403 is the real "not the developer" answer. A dropped connection is not.
          if (err?.status === 403 || err?.status === 401) cache.set(userId, false);
          return false;
        })
        .finally(() => inflight.delete(userId)),
    );
  }
  return inflight.get(userId);
}

/** Whether this account is the developer (DEVELOPER_EMAIL). The server still enforces it. */
export default function useDeveloperAccess() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState(() => ({
    isDeveloper: userId != null ? cache.get(userId) === true : false,
    loading: userId != null && !cache.has(userId),
  }));

  useEffect(() => {
    let active = true;
    if (userId == null) {
      setState({ isDeveloper: false, loading: false });
      return undefined;
    }
    if (cache.has(userId)) {
      setState({ isDeveloper: cache.get(userId), loading: false });
      return undefined;
    }
    setState({ isDeveloper: false, loading: true });
    resolveAccess(userId).then((allowed) => {
      if (active) setState({ isDeveloper: allowed, loading: false });
    });
    return () => { active = false; };
  }, [userId]);

  return state;
}
