import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input, Button } from '../../components/ui';
import AuthShell from '../../components/AuthShell';
import { t } from '../../utils/i18n';

export default function Register() {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [form, setForm] = useState({ store_code: '', full_name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((x) => ({ ...x, [f]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.store_code.trim() || !form.full_name.trim() || !form.email.trim() || !form.password) { showError(t('all_fields_required', lang)); return; }
    try {
      setSaving(true);
      const res = await authService.register({ ...form, store_code: form.store_code.trim(), email: form.email.trim(), preferred_language: lang });
      showSuccess(t(res.message, lang));
      setForm({ store_code: '', full_name: '', email: '', password: '' });
    } catch (err) { showError(t(err.message, lang) || t('register_failed', lang)); }
    finally { setSaving(false); }
  };

  return (
    <AuthShell
      title={t('register', lang)}
      footer={<p>{t('already_have_account', lang)} <Link to="/login" className="text-primary font-medium hover:underline">{t('login', lang)}</Link></p>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('store_code', lang)} required value={form.store_code} onChange={set('store_code')} />
        <Input label={t('full_name', lang)} required value={form.full_name} onChange={set('full_name')} autoComplete="name" />
        <Input type="email" label={t('email', lang)} required value={form.email} onChange={set('email')} autoComplete="username" />
        <Input type="password" label={t('password', lang)} required value={form.password} onChange={set('password')} autoComplete="new-password" />
        <Button type="submit" loading={saving} className="w-full justify-center">{t('register', lang)}</Button>
      </form>
    </AuthShell>
  );
}
