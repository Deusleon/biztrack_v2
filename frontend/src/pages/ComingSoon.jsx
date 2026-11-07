import { Link, useLocation } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { itemForPath } from '../utils/navigation';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

/** Stands in for a page that has not been moved to the new BizTrack yet (see MIGRATION_CHECKLIST.md). */
export default function ComingSoon() {
  const { pathname } = useLocation();
  const { lang } = useLanguage();
  const item = itemForPath(pathname);
  const page = item ? t(item.label, lang) : pathname;
  return (
    <MainLayout>
      <div className="max-w-lg mx-auto mt-16 bg-white rounded shadow p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{t('ui_moving_title', lang)}</h1>
        <p className="text-sm text-gray-600 mt-3">{t('ui_moving_text', lang, { page })}</p>
        <Link to="/dashboard" className="inline-block mt-5 text-sm text-primary hover:underline">{t('ui_go_dashboard', lang)}</Link>
      </div>
    </MainLayout>
  );
}
