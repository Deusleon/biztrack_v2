// FILE PATH: frontend/src/components/Sidebar.jsx
import { useRef, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useStore } from '../contexts/StoreContext';
import { NAV_SECTIONS, canOpen, ICON_PATHS } from '../utils/navigation';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';
import BrandMark from './BrandMark';
import useDeveloperAccess from '../hooks/useDeveloperAccess';
import { supportService } from '../services/api';

const NavIcon = ({ name, className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
  const [supportDesk, setSupportDesk] = useState(false);
  useEffect(() => {
    if (isDeveloper) { setSupportDesk(true); return undefined; }
    let active = true;
    supportService.adminAccess().then(() => { if (active) setSupportDesk(true); }).catch(() => { if (active) setSupportDesk(false); });
    return () => { active = false; };
  }, [isDeveloper, user?.id]);
  const navRef = useRef(null);

  // Phones: the drawer covers the page. Choosing a page (or landing on one) puts it away.
  useEffect(() => { closeSidebar?.(); }, [location.pathname, closeSidebar]);

  const allPaths = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to).filter(Boolean));
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

  // A lapsed store keeps Subscription, the user guide, help, and — for the developer — Extend subscription.
  const allowed = (item) => {
    if (item.supportOnly && !supportDesk) return false;
    if (locked) return item.action === 'help' || ['/subscription', '/user-manual'].includes(item.to) || (item.to === '/subscription/manual' && isDeveloper);
    return canOpen(item, can, { developer: isDeveloper });
  };
  const visible = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter(allowed) }))
    .filter((s) => s.items.length > 0);

  const activeKey = visible.find((section) => section.title && section.items.some((item) => isActive(item.to)))?.key || '';
  const [openKey, setOpenKey] = useState(activeKey);
  useEffect(() => { setOpenKey(activeKey); }, [activeKey]);
  const onSection = (key) => setOpenKey((current) => (current === key ? (key === activeKey ? key : activeKey) : key));

  const initials = (user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={toggleSidebar} />}
      <aside className={`fixed top-0 left-0 z-30 h-screen transition-all duration-300 ease-in-out print:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${isCollapsed ? 'lg:w-20 sidebar-icons' : 'lg:w-64'} w-64`}>
        <div className="h-full flex flex-col gradient-primary-dark text-white shadow-2xl sidebar-edge">
          <div className={`flex items-center border-b border-primary-dark transition-all duration-300 ${isCollapsed ? 'lg:justify-center p-4 lg:py-2.5 lg:px-4' : 'justify-between p-4'}`}>
            <div className={`flex items-center space-x-3 ${isCollapsed ? 'lg:space-x-0' : ''}`}>
              <BrandMark variant="color" className="w-11 h-auto flex-shrink-0" />
              <div className={isCollapsed ? 'lg:hidden' : ''}>
                <h1 className="text-xl font-bold tracking-tight">BizTrack</h1>
                <p className="text-xs text-white opacity-80 truncate max-w-[9rem]">{currentStore?.name || 'Business Management'}</p>
              </div>
            </div>
            <button onClick={toggleSidebar} className="lg:hidden text-white hover:bg-primary-dark hover:opacity-80 p-2 rounded" aria-label="Close menu">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <nav ref={navRef} className="flex-1 overflow-y-auto py-4 px-1.5 scrollbar-thin scrollbar-thumb-primary-dark scrollbar-track-transparent">
            {visible.map((section) => {
              const group = section.items.length > 1;
              const open = group && openKey === section.key;
              const linkClass = (active) => `nav-link w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left font-semibold uppercase tracking-wider ${active ? 'is-open' : ''} ${isCollapsed ? 'lg:justify-center' : ''}`;
              if (!group) {
                const item = section.items[0];
                const label = t(item.label, lang);
                const active = item.to ? isActive(item.to) : false;
                const inner = (<><NavIcon name={section.icon || item.icon} className="w-4 h-4 flex-shrink-0" /><span className={`truncate ${isCollapsed ? 'lg:hidden' : ''}`}>{label}</span></>);
                if (item.action === 'help') {
                  return <div key={section.key} className="nav-section"><button type="button" onClick={onHelp} title={isCollapsed ? label : ''} className={linkClass(false)}>{inner}</button></div>;
                }
                return <div key={section.key} className="nav-section"><Link to={item.to} title={isCollapsed ? label : ''} className={linkClass(active)}>{inner}</Link></div>;
              }
              return (
              <div key={section.key} className="nav-section">
                <button type="button" onClick={() => onSection(section.key)} aria-expanded={open} className={`nav-section-btn w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-left font-semibold uppercase tracking-wider ${open ? 'is-open' : ''} ${isCollapsed ? 'lg:hidden' : ''}`}>
                  <span className="flex items-center gap-2 min-w-0">
                    <NavIcon name={section.icon || 'box'} className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{t(section.title, lang)}</span>
                  </span>
                  <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className={`nav-panel ${open ? 'open' : ''}`}>
                  <div className="nav-clip">
                <div className="nav-well">
                  {section.items.map((item) => {
                    const label = t(item.label, lang);
                    const row = `nav-item flex items-center gap-2 py-2 text-sm font-medium ${isCollapsed ? 'lg:justify-center lg:px-2 pl-8 pr-4' : 'pl-8 pr-4'} ${item.to && isActive(item.to) ? 'is-current' : ''}`;
                    const inner = (<><NavIcon name={item.icon} className="w-4 h-4 flex-shrink-0" /><span className={isCollapsed ? 'lg:hidden' : ''}>{label}</span></>);
                    if (item.action === 'help') {
                      return <button key={item.label} type="button" onClick={onHelp} title={isCollapsed ? label : ''} className={`w-full text-left ${row}`}>{inner}</button>;
                    }
                    return <Link key={item.to} to={item.to} title={isCollapsed ? label : ''} className={row}>{inner}</Link>;
                  })}
                </div>
                  </div>
                </div>
              </div>
              );
            })}
          </nav>

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
