import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';

/** With ?key=… (the link in the email) confirms the address; without it, lets the person ask for a new link. */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const key = params.get('key');
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [state, setState] = useState(key ? 'verifying' : 'idle');   // verifying | ok | failed | idle
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!key || ran.current) return; ran.current = true;
    authService.verifyEmail({ token: key })
      .then((res) => { showSuccess(res.message); setState('ok'); setTimeout(() => navigate('/login'), 3000); })
      .catch((err) => { showError(err.message || t('failed_to_verify_email', lang)); setState('failed'); setTimeout(() => navigate('/verify-email'), 3000); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try { setSaving(true); const res = await authService.resendEmail({ email: email.trim() }); showSuccess(res.message); setEmail(''); }
    catch (err) { showError(err.message || t('failed_to_send_email', lang)); }
    finally { setSaving(false); }
  };

  return (
    <AuthShell title={t('verify_email', lang)} footer={<Link to="/login" className="text-primary font-medium hover:underline">{t('login', lang)}</Link>}>
      {state === 'verifying' && <p className="text-center text-sm text-gray-500">{t('loading_data', lang)}</p>}
      {state === 'ok' && <p className="text-center text-sm text-green-600">{t('email_verified_successfully', lang)}</p>}
      {(state === 'idle' || state === 'failed') && (
        <form onSubmit={resend} className="space-y-4" noValidate>
          <Input type="email" label={t('email', lang)} required placeholder={t('enter_email', lang)} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={saving} className="w-full justify-center">{t('resend_email', lang)}</Button>
        </form>
      )}
    </AuthShell>
  );
}
