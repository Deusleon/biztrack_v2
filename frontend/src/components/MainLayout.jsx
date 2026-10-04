// FILE PATH: frontend/src/components/MainLayout.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../utils/i18n';
import { isStandalone } from '../utils/pwa';
import { attachPullToRefresh } from '../utils/pullToRefresh';
import { ICON_PATHS } from '../utils/navigation';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import SupportWidget from './SupportWidget';
import { useIdleLock } from '../contexts/IdleLockContext';
import InstallBanner from './InstallBanner';

const Svg = ({ d, className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);

/** Every signed-in page sits inside this: sidebar, top bar (store, language, account) and the page itself. */
export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { stores, currentStore, setCurrentStore, canSwitchStore, switching } = useStore();
  const { lang, setLang } = useLanguage();
  const { forceLock } = useIdleLock();
  const [helpOpen, setHelpOpen] = useState(false);
  const { showError } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleCollapse = () => { const next = !collapsed; setCollapsed(next); localStorage.setItem('sidebarCollapsed', String(next)); };
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // The installed phone app has no reload button: pulling the page down reloads it.
  useEffect(() => (isStandalone() && 'ontouchstart' in window ? attachPullToRefresh() : undefined), []);

  const changeStore = async (e) => {
    try { await setCurrentStore(e.target.value); }
    catch (err) { showError(err.message); }
  };

  const signOut = async () => { await logout(); navigate('/login', { replace: true }); };
  const initials = (user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen((o) => !o)} closeSidebar={closeSidebar} isCollapsed={collapsed} />

      <div className={`transition-all duration-300 min-h-screen flex flex-col ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200 print:hidden safe-top">
          <div className="flex items-center justify-between px-4 h-14 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded text-gray-600 hover:bg-gray-100" aria-label={t('ui_menu', lang)}><Svg d={ICON_PATHS.menu} /></button>
              <button onClick={toggleCollapse} className="hidden lg:block p-2 rounded text-gray-600 hover:bg-gray-100" title={collapsed ? t('ui_expand_menu', lang) : t('ui_collapse_menu', lang)} aria-label={t('ui_menu', lang)}><Svg d={ICON_PATHS.menu} /></button>

              {canSwitchStore ? (
                <select
                  value={currentStore?.id || ''}
                  onChange={changeStore}
                  disabled={switching}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[12rem] sm:max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-primary-20"
                  aria-label={t('select_store', lang)}
                  title={t('switch_store', lang)}
                >
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <span className="text-sm font-medium text-gray-700 truncate">{currentStore?.name}</span>
              )}
              {switching && <span className="text-xs text-gray-500">{t('ui_switching_store', lang)}</span>}
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <button type="button" onClick={forceLock} className="p-2 rounded text-gray-600 hover:bg-gray-100" title={t('lock_screen', lang)} aria-label={t('lock_screen', lang)}><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V8a4 4 0 10-8 0v3m-1 0h10a1 1 0 011 1v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7a1 1 0 011-1z" /></svg></button>
              <button
                onClick={() => setLang(lang === 'sw' ? 'en' : 'sw')}
                className="text-xs font-semibold border border-gray-300 rounded px-2 py-1.5 text-gray-700 hover:bg-gray-50"
                title="Swahili / English"
              >{lang === 'sw' ? 'SW' : 'EN'}</button>

              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 p-1 rounded hover:bg-gray-100" aria-haspopup="menu" aria-expanded={menuOpen}>
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <span className="w-8 h-8 rounded-full gradient-primary text-white text-sm font-semibold flex items-center justify-center">{initials}</span>}
                  <span className="hidden sm:block text-sm text-gray-700 max-w-[10rem] truncate">{user?.name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded shadow-lg py-1 z-20" role="menu">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem"><Svg d={ICON_PATHS.user} className="w-4 h-4" />{t('profile', lang)}</Link>
                    <button onClick={() => { setMenuOpen(false); setHelpOpen(true); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left" role="menuitem">{t('help_and_support', lang)}</button>
                    <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left" role="menuitem"><Svg d={ICON_PATHS.logout} className="w-4 h-4" />{t('sign_out', lang)}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <InstallBanner />
        <main className="flex-1 px-4 py-3 print:p-0">{children}</main>
      </div>
          <SupportWidget isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
</div>
  );
}
