// FILE PATH: frontend/src/hooks/useLiveRefresh.js
import { useEffect, useLayoutEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

/**
 * Real-time updates, EduTrack style: when ANOTHER person (or device) adds / changes / removes a record,
 * the server announces it on the socket and this page simply loads its list again — the page never edits
 * its own rows by hand, so what is on screen is always what the server holds.
 *
 *   useLiveRefresh(['categoryCreated', 'categoryUpdated', 'categoryDeleted'], fetchCategories);
 *
 * Several events arriving together (a bulk delete) cause a single reload.
 */
export default function useLiveRefresh(events, reload, { delay = 400 } = {}) {
  const reloadRef = useRef(reload);
  useLayoutEffect(() => { reloadRef.current = reload; });
  const key = Array.isArray(events) ? events.join('|') : String(events);

  useEffect(() => {
    let timer;
    let attached = null;
    const handler = () => { clearTimeout(timer); timer = setTimeout(() => reloadRef.current?.(), delay); };
    const names = key.split('|').filter(Boolean);

    // The socket may not exist yet on first render (it connects once the store is known) — keep looking briefly.
    const attach = () => {
      const socket = getSocket();
      if (!socket) return false;
      names.forEach((n) => socket.on(n, handler));
      attached = socket;
      return true;
    };
    let poll;
    if (!attach()) { poll = setInterval(() => { if (attach()) clearInterval(poll); }, 1000); }

    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      if (attached) names.forEach((n) => attached.off(n, handler));
    };
  }, [key, delay]);
}
