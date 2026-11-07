// FILE PATH: frontend/src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { Input, Button } from '../components/ui';
import BrandMark from '../components/BrandMark';
import InstallAppCard from '../components/InstallAppCard';
import { t } from '../utils/i18n';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const { lang, setLang } = useLanguage();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const dest = location.state?.from?.pathname || '/dashboard';
  useEffect(() => { if (isAuthenticated) navigate(dest, { replace: true }); }, [isAuthenticated, dest, navigate]);

  // Why the person landed here ("session expired", signed out elsewhere…).
  useEffect(() => {
    const why = params.get('error');
    if (why === 'session_expired' || why === 'unauthorized') setNotice(t('session_expired', lang));
  }, [params, lang]);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setErrors((x) => ({ ...x, [field]: '' })); };

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = t('email_required', lang);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t('invalid_email', lang);
    if (!form.password) next.password = t('password_required', lang);
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !validate()) return;
    try {
      setLoading(true);
      const res = await login({ email: form.email.trim(), password: form.password });
      showSuccess(res.message);
      navigate(res.user?.password_change_required ? '/profile?passwordExpired=1' : dest, { replace: true });
    } catch (err) {
      // An account that has not confirmed its email yet is sent to that step.
      if (err.redirect === 'verify-email') {
        showError(err.message);
        setTimeout(() => navigate('/verify-email'), 1500);
        return;
      }
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8 safe-top">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-3">
          <div className="flex rounded overflow-hidden border border-gray-300 text-xs bg-white" role="group" aria-label="Language">
            {['sw', 'en'].map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={`px-3 py-1.5 uppercase ${lang === l ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded shadow p-6 sm:p-8 space-y-4" noValidate>
          <div className="text-center mb-2">
            <BrandMark className="w-16 h-16 mx-auto mb-3 rounded" />
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('login', lang)}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('login_msg', lang)}</p>
          </div>

          {notice && <div className="rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 text-left">{notice}</div>}

          <Input label={t('email', lang)} type="email" autoComplete="username" value={form.email} onChange={set('email')} error={errors.email} placeholder={t('enter_email', lang)} />
          <Input
            label={t('password', lang)} type={showPassword ? 'text' : 'password'} autoComplete="current-password"
            value={form.password} onChange={set('password')} error={errors.password} placeholder={t('enter_password', lang)}
          />
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              {t('show_password', lang)}
            </label>
            <Link to="/forgot-password" className="text-primary hover:underline">{t('forgot_password', lang)}</Link>
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>{loading ? t('logging_in', lang) : t('login', lang)}</Button>

          <p className="text-sm text-center text-gray-600">
            {t('no_account', lang)} <Link to="/register" className="text-primary font-medium hover:underline">{t('register', lang)}</Link>
          </p>
        </form>

        <div className="mt-4"><InstallAppCard /></div>
      </div>
    </div>
  );
}
