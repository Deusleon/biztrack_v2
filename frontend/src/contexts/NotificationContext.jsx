// FILE PATH: frontend/src/contexts/NotificationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { settingsAdminService } from '../services/api';
import { t } from '../utils/i18n';

const NotificationContext = createContext({ notifications: [], unreadCount: 0, markAllRead: () => {}, markRead: () => {}, clearAll: () => {} });
const TITLE_KEYS = { new_sale: 'notify_new_sale', purchase_received: 'notify_purchase_received', stock_transfer: 'notify_stock_transfer', low_stock: 'notify_low_stock', payment_due: 'notify_payment_due', sales_return: 'notify_sales_return', stock_adjustment: 'notify_stock_adjustment', new_user: 'notify_new_user', user_activity: 'notify_user_activity', cloud_backup: 'notify_cloud_backup' };
const MAX = 50;

/** The bell: announcements the server pushes by socket ("inAppNotification"), filtered by this store's in-app switches, kept per person on this device. */
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!user) { setSettings(null); setNotifications([]); return; }
    try { const stored = JSON.parse(localStorage.getItem(`notifs_${user.id}`) || 'null'); if (Array.isArray(stored)) setNotifications(stored); } catch { /* start empty */ }
    settingsAdminService.getNotifications().then((n) => setSettings(n || {})).catch(() => setSettings({}));
  }, [user?.id, user?.storeInfo?.store_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the Notifications settings screen tells us when the switches change
  useEffect(() => { const h = (e) => setSettings(e.detail || {}); window.addEventListener('biztrack-notification-settings-updated', h); return () => window.removeEventListener('biztrack-notification-settings-updated', h); }, []);
  useEffect(() => { if (user?.id) localStorage.setItem(`notifs_${user.id}`, JSON.stringify(notifications)); }, [notifications, user?.id]);

  useEffect(() => {
    if (!user || settings === null) return undefined;
    const socket = getSocket(); if (!socket) return undefined;
    const onNotify = (data) => {
      if (settings[`inapp_${data.type}`] === false) return;
      const key = TITLE_KEYS[data.type];
      setNotifications((prev) => [{ id: `${data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: data.type, title: key ? t(key) : data.title || data.type, message: data.message || '', meta: data.meta || {}, timestamp: data.timestamp || new Date().toISOString(), read: false }, ...prev.slice(0, MAX - 1)]);
    };
    socket.on('inAppNotification', onNotify);
    return () => socket.off('inAppNotification', onNotify);
  }, [user?.id, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = useCallback(() => setNotifications((p) => p.map((n) => ({ ...n, read: true }))), []);
  const markRead = useCallback((id) => setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const clearAll = useCallback(() => setNotifications([]), []);
  return <NotificationContext.Provider value={{ notifications, unreadCount: notifications.filter((n) => !n.read).length, markAllRead, markRead, clearAll }}>{children}</NotificationContext.Provider>;
}
export const useNotifications = () => useContext(NotificationContext);
