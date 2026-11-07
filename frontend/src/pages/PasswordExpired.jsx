import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { profileService } from '../services/api';
import { Input, Button } from '../components/ui';
import BrandMark from '../components/BrandMark';
import { t } from '../utils/i18n';

/**
 * Shown INSTEAD of the app while the password is expired (the server refuses everything else anyway,
 * so there is no way to carry on without choosing a new one). Saved → the app opens straight away.
 */
export default function PasswordExpired() {
  const { updateSessionAfterPasswordChange, logout } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const set = (f) => (e) => setForm((x) => ({ ...x, [f]: e.target.value }));

  const checks = [
    { ok: form.new_password.length >= 8, label: t('ui_password_min8', lang) },
    { ok: !!form.new_password && form.new_password !== form.current_password, label: t('ui_different_from_current', lang) },
    { ok: !!form.confirm_password && form.new_password === form.confirm_password, label: t('ui_passwords_match', lang) },
  ];
  const ready = form.current_password && checks.every((c) => c.ok);

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || saving) return;
    try {
      setSaving(true);
      const res = await profileService.changePassword({ current_password: form.current_password, new_password: form.new_password });
      updateSessionAfterPasswordChange({ token: res.token, security: res.security });
      showSuccess(res.message);
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form onSubmit={submit} className="max-w-md w-full bg-white rounded shadow p-8 space-y-4">
        <div className="text-center">
          <BrandMark className="w-14 h-auto mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">{t('ui_password_expired_title', lang)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('ui_password_expired_text', lang)}</p>
        </div>
        <Input type="password" label={t('ui_current_password', lang)} required autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
        <Input type="password" label={t('ui_new_password', lang)} required autoComplete="new-password" value={form.new_password} onChange={set('new_password')} />
        <Input type="password" label={t('ui_confirm_password', lang)} required autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
        <ul className="text-xs space-y-1 text-left">
          {checks.map((c) => <li key={c.label} className={c.ok ? 'text-green-600' : 'text-gray-400'}>{c.ok ? '✓' : '○'} {c.label}</li>)}
        </ul>
        <div className="flex justify-between items-center pt-1">
          <button type="button" className="text-sm text-gray-500 hover:underline" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>{t('sign_out', lang)}</button>
          <Button type="submit" loading={saving} disabled={!ready}>{t('ui_save_password', lang)}</Button>
        </div>
      </form>
    </div>
  );
}
