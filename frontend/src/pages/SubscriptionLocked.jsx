import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui';
import BrandMark from '../components/BrandMark';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

/** Shown instead of the app when the store's subscription has lapsed and this person cannot open the Subscription page. */
export default function SubscriptionLocked() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded shadow p-8 text-center">
        <BrandMark className="w-14 h-auto mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-gray-900">{t('subscription_locked_title', lang)}</h1>
        <p className="text-sm text-gray-600 mt-2">{t('subscription_locked_text', lang)}</p>
        <Button className="mt-6" variant="secondary" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>{t('sign_out', lang)}</Button>
      </div>
    </div>
  );
}
