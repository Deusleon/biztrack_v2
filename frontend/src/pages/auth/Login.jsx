import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import Icon from '../../components/ui/Icon';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';
import { peekLoginNotice, clearLoginNotice } from '../../utils/sessionStore';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Said by the server / the app when a session ended on its own.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('error');
    const reason = peekLoginNotice() || fromUrl;
    if (reason === 'signed_in_elsewhere') showError('signed_in_elsewhere', 8000);
    else if (reason === 'session_expired' || reason === 'unauthorized') showError('session_expired', 8000);
    // Clear only after this effect has run again following a strict-mode remount.
    const timer = window.setTimeout(() => {
      clearLoginNotice();
      if (fromUrl) navigate('/login', { replace: true });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => { if (isAuthenticated) navigate(location.state?.from?.pathname || '/dashboard', { replace: true }); }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) return;
    try {
      setSaving(true);
      const res = await login({ email: form.email.trim(), password: form.password });
      const preferred = res.user?.preferred_language;
      if (preferred === 'en' || preferred === 'sw') setLang(preferred);
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
          rightIcon={<button type="button" onClick={() => setShowPassword((s) => !s)} className="text-gray-400 hover:text-gray-600 pointer-events-auto" aria-label={t(showPassword ? 'hide_password' : 'show_password', lang)} tabIndex={-1}><Icon name={showPassword ? 'eyeOff' : 'eye'} className="w-5 h-5" /></button>}
        />
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-primary hover:underline">{t('forgot_password', lang)}</Link></div>
        <Button type="submit" loading={saving} className="w-full justify-center">{saving ? t('logging_in', lang) : t('login', lang)}</Button>
      </form>
    </AuthShell>
  );
}
