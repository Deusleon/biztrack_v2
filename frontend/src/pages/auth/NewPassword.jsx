import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';

/** Opened from the link in the reset email: …/new-password?token=…&email=… */
export default function NewPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [valid, setValid] = useState(null);       // null = still checking
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    if (!token || !email) { showError(t('no_token_or_email', lang)); setValid(false); return; }
    authService.verifyResetLink({ token, email })
      .then((res) => { setValid(true); if (res.message) showSuccess(res.message); })
      .catch((err) => { showError(err.message); setValid(false); setTimeout(() => navigate('/forgot-password'), 3000); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { showError(t('passwords_do_not_match', lang)); return; }
    try {
      setSaving(true);
      const res = await authService.resetPassword({ password: form.password, token, email });
      showSuccess(res.message);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <AuthShell title={t('reset_password', lang)} footer={<Link to="/login" className="text-primary font-medium hover:underline">{t('login', lang)}</Link>}>
      {valid === null && <p className="text-center text-sm text-gray-500">{t('loading_data', lang)}</p>}
      {valid === false && <p className="text-center text-sm text-red-600">{t('invalid_or_expired_token', lang)}</p>}
      {valid && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input type="password" label={t('password', lang)} required autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <Input type="password" label={t('confirm_password', lang)} required autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
          <Button type="submit" loading={saving} className="w-full justify-center">{t('reset_password', lang)}</Button>
        </form>
      )}
    </AuthShell>
  );
}
