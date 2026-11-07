import { Link } from 'react-router-dom';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

export default function NotFound() {
  const { lang } = useLanguage();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 text-center">
      <div>
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-lg font-semibold text-gray-900">{t('page_not_found', lang)}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('page_not_found_subtitle', lang)}</p>
        <Link to="/dashboard" className="inline-block mt-5 text-sm text-primary hover:underline">{t('ui_go_dashboard', lang)}</Link>
      </div>
    </div>
  );
}
