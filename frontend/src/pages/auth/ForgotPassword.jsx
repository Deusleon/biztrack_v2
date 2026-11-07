import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';

export default function ForgotPassword() {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try { setSaving(true); const res = await authService.forgotPassword({ email: email.trim() }); showSuccess(res.message); setEmail(''); }
    catch (err) { showError(err.message || t('failed_to_send_email', lang)); }
    finally { setSaving(false); }
  };

  return (
    <AuthShell title={t('forgot_password', lang)} footer={<Link to="/login" className="text-primary font-medium hover:underline">{t('login', lang)}</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input type="email" label={t('email', lang)} required placeholder={t('enter_email', lang)} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" loading={saving} className="w-full justify-center">{t('send', lang)}</Button>
      </form>
    </AuthShell>
  );
}
