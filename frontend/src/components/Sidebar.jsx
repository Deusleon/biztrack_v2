// FILE PATH: frontend/src/components/Sidebar.jsx
import { useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useStore } from '../contexts/StoreContext';
import { NAV_SECTIONS, canOpen, ICON_PATHS } from '../utils/navigation';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';
import BrandMark from './BrandMark';
import useDeveloperAccess from '../hooks/useDeveloperAccess';

const NavIcon = ({ name }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[name] || ICON_PATHS.box} />
  </svg>
);

const Sidebar = ({ isOpen, toggleSidebar, closeSidebar, isCollapsed, onHelp }) => {
  const location = useLocation();
  const { user, can } = useAuth();
  const { locked } = useSubscription();
  const { currentStore } = useStore();
  const { lang } = useLanguage();            // re-render the labels when the language changes
  const { isDeveloper } = useDeveloperAccess();
  const navRef = useRef(null);

  // Phones: the drawer covers the page. Choosing a page (or landing on one) puts it away.
  useEffect(() => { closeSidebar?.(); }, [location.pathname, closeSidebar]);

  const allPaths = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to));
  const isActive = (path) => {
    if (location.pathname === path) return true;
    if (!location.pathname.startsWith(`${path}/`)) return false;
    // Stay un-highlighted on a sub-path that has its own, more specific menu entry.
    return !allPaths.some((other) => other !== path && other.startsWith(`${path}/`) && location.pathname.startsWith(other));
  };

  // Keep the menu where the person had scrolled it.
  useEffect(() => {
    const el = navRef.current; if (!el) return undefined;
    const saved = sessionStorage.getItem('sidebarScrollPosition');
    if (saved) el.scrollTop = parseInt(saved, 10);
    const onScroll = () => sessionStorage.setItem('sidebarScrollPosition', String(el.scrollTop));
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // A store with a lapsed subscription sees the Subscription page (and the manual), nothing else.
  const visible = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => (locked ? ['/subscription', '/user-manual'].includes(i.to) : canOpen(i, can, { developer: isDeveloper }))) }))
    .filter((s) => s.items.length > 0);

  const initials = (user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={toggleSidebar} />}
      <aside className={`fixed top-0 left-0 z-30 h-screen transition-all duration-300 ease-in-out print:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-64`}>
        <div className="h-full flex flex-col gradient-primary-dark text-white shadow-2xl sidebar-edge">
          <div className={`flex items-center border-b border-primary-dark transition-all duration-300 ${isCollapsed ? 'lg:justify-center p-4 lg:py-2.5 lg:px-4' : 'justify-between p-4'}`}>
            <div className={`flex items-center space-x-3 ${isCollapsed ? 'lg:space-x-0' : ''}`}>
              <BrandMark className="w-11 h-auto flex-shrink-0" />
              <div className={isCollapsed ? 'lg:hidden' : ''}>
                <h1 className="text-xl font-bold tracking-tight">BizTrack</h1>
                <p className="text-xs text-white opacity-80 truncate max-w-[9rem]">{currentStore?.name || 'Business Management'}</p>
              </div>
            </div>
            <button onClick={toggleSidebar} className="lg:hidden text-white hover:bg-primary-dark hover:opacity-80 p-2 rounded" aria-label="Close menu">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <nav ref={navRef} className="flex-1 overflow-y-auto py-6 px-3 space-y-6 scrollbar-thin scrollbar-thumb-primary-dark scrollbar-track-transparent">
            {visible.map((section) => (
              <div key={section.key}>
                {section.title && (
                  <h3 className={`px-4 mb-2 text-xs text-left font-semibold text-white opacity-70 uppercase tracking-wider ${isCollapsed ? 'lg:hidden' : ''}`}>{t(section.title, lang)}</h3>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={isCollapsed ? t(item.label, lang) : ''}
                      className={`flex items-center py-2.5 text-sm font-medium rounded transition-all duration-200 ${isCollapsed ? 'lg:justify-center lg:px-2 px-4' : 'px-4'} ${isActive(item.to) ? 'bg-white text-primary-dark shadow-lg' : 'text-white opacity-90 hover:bg-primary-dark hover:opacity-100'}`}
                    >
                      <span className={isCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'}><NavIcon name={item.icon} /></span>
                      <span className={isCollapsed ? 'lg:hidden' : ''}>{t(item.label, lang)}</span>
                      {isActive(item.to) && !isCollapsed && <span className="ml-auto w-2 h-2 bg-primary rounded-full" />}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className={`border-t border-primary-dark ${isCollapsed ? 'lg:px-2' : ''}`}>
            <button type="button" onClick={onHelp} title={t('help_and_support', lang)} className={`w-full flex items-center py-3 text-sm font-medium text-white opacity-90 hover:bg-primary-dark hover:opacity-100 ${isCollapsed ? 'lg:justify-center lg:px-2 px-4' : 'px-7'}`}>
              <span className={isCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'}><NavIcon name="help" /></span>
              <span className={isCollapsed ? 'lg:hidden' : ''}>{t('help_and_support', lang)}</span>
            </button>
          </div>
          <div className={`p-4 border-t border-primary-dark ${isCollapsed ? 'lg:px-2' : ''}`}>
            <Link to="/profile" className={`flex items-center rounded bg-primary-dark bg-opacity-50 p-3 space-x-3 hover:bg-opacity-70 ${isCollapsed ? 'lg:flex-col lg:space-x-0 lg:space-y-2 lg:p-2' : ''}`}>
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                : <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-semibold flex-shrink-0">{initials}</div>}
              <div className={`flex-1 min-w-0 text-left ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-white opacity-80 truncate capitalize">{user?.storeInfo?.role_name}</p>
              </div>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
