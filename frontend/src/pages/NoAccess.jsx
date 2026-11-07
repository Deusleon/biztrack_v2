import { Link } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

export default function NoAccess() {
  const { lang } = useLanguage();
  return (
    <MainLayout>
      <div className="max-w-md mx-auto mt-16 bg-white rounded shadow p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{t('ui_no_access_title', lang)}</h1>
        <p className="text-sm text-gray-500 mt-2">{t('ui_no_access_text', lang)}</p>
        <Link to="/dashboard" className="inline-block mt-5 text-sm text-primary hover:underline">{t('ui_go_dashboard', lang)}</Link>
      </div>
    </MainLayout>
  );
}
