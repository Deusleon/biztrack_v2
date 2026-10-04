// FILE PATH: frontend/src/components/NotificationBell.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';
import { timeAgo } from '../utils/timeAgo';

// where a click on a notification takes you
const GO = { new_sale: '/sales/history', purchase_received: '/purchases/goods-received', stock_transfer: '/inventory/stock-transfer', low_stock: '/inventory/current-stock', payment_due: '/sales/debits', sales_return: '/sales/returns', stock_adjustment: '/inventory/adjustment', new_user: '/users/all', user_activity: '/settings/tools', cloud_backup: '/settings/integration' };

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const go = (n) => { markRead(n.id); setOpen(false); if (GO[n.type]) navigate(GO[n.type]); };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative p-2 rounded text-gray-600 hover:bg-gray-100" aria-label={t('notifications', lang)} aria-haspopup="menu" aria-expanded={open}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" /></svg>
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded shadow-lg z-30" role="menu">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between"><span className="text-sm font-semibold text-gray-800">{t('notifications', lang)}</span><span className="flex gap-3 text-xs"><button type="button" className="text-primary hover:underline disabled:opacity-40" disabled={unreadCount === 0} onClick={markAllRead}>{t('mark_all_read', lang)}</button><button type="button" className="text-gray-500 hover:underline disabled:opacity-40" disabled={notifications.length === 0} onClick={clearAll}>{t('clear', lang)}</button></span></div>
          <ul className="max-h-96 overflow-auto divide-y divide-gray-100">
            {notifications.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">{t('no_notifications', lang)}</li>}
            {notifications.map((n) => <li key={n.id}><button type="button" onClick={() => go(n)} className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 ${n.read ? '' : 'bg-primary-10'}`}><p className="text-sm font-medium text-gray-800 flex items-center gap-2">{!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}{n.title}</p>{n.message && <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>}<p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.timestamp)}</p></button></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
