import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Said by the server / the app when a session ended on its own.
  useEffect(() => {
    const reason = new URLSearchParams(location.search).get('error');
    if (reason === 'session_expired' || reason === 'unauthorized') showError(t('session_expired', lang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (isAuthenticated) navigate(location.state?.from?.pathname || '/dashboard', { replace: true }); }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) return;
    try {
      setSaving(true);
      const res = await login({ email: form.email.trim(), password: form.password });
      showSuccess(res.message);
      navigate(res.password_change_required ? '/dashboard' : (location.state?.from?.pathname || '/dashboard'), { replace: true });
    } catch (err) {
      // An account that has not confirmed its email yet is sent to the page where it can ask for a new link.
      if (err.redirect === 'verify-email') { showError(err.message); setTimeout(() => navigate('/verify-email'), 1500); }
      else showError(err.message);
    } finally { setSaving(false); }
  };

  return (
    <AuthShell
      title={t('login', lang)} subtitle={t('ui_sign_in_subtitle', lang)}
      footer={<p>{t('no_account', lang)} <Link to="/register" className="text-primary font-medium hover:underline">{t('register_here', lang)}</Link></p>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input type="email" label={t('email', lang)} required autoComplete="username" placeholder={t('enter_email', lang)} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Input
          type={showPassword ? 'text' : 'password'} label={t('password', lang)} required autoComplete="current-password"
          placeholder={t('enter_password', lang)} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          rightIcon={<button type="button" onClick={() => setShowPassword((s) => !s)} className="text-gray-400 hover:text-gray-600 text-xs pointer-events-auto" tabIndex={-1}>{showPassword ? '🙈' : '👁'}</button>}
        />
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-primary hover:underline">{t('forgot_password', lang)}</Link></div>
        <Button type="submit" loading={saving} className="w-full justify-center">{saving ? t('logging_in', lang) : t('login', lang)}</Button>
      </form>
    </AuthShell>
  );
}
