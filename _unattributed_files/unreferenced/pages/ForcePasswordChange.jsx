// FILE PATH: frontend/src/pages/ForcePasswordChange.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { Input, Button } from '../components/ui';
import BrandMark from '../components/BrandMark';
import { t } from '../utils/i18n';
import api from '../utils/api';

/**
 * Shown INSTEAD of the app while a password has expired (or an administrator asked for a new one). The server
 * refuses every other request until it is changed (HTTP 428), so there is no way around this step.
 */
export default function ForcePasswordChange() {
  useLanguage();
  const { logout, updateSessionAfterPasswordChange } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (f) => (e) => { setForm((x) => ({ ...x, [f]: e.target.value })); setError(''); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.current_password || !form.new_password) return setError(t('all_fields_required'));
    if (form.new_password.length < 8) return setError(t('password_too_short'));
    if (form.new_password !== form.confirm_password) return setError(t('passwords_do_not_match'));
    if (form.new_password === form.current_password) return setError(t('new_password_must_differ'));
    try {
      setSaving(true);
      const res = await api.put('/profile/password', { current_password: form.current_password, new_password: form.new_password });
      updateSessionAfterPasswordChange(res);
      showSuccess(res.message);
    } catch (err) { setError(err.message); showError(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8 safe-top">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded shadow p-6 sm:p-8 space-y-4">
        <div className="text-center">
          <BrandMark className="w-14 h-14 mx-auto mb-3 rounded" />
          <h1 className="text-lg font-bold text-gray-900">{t('change_password')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('password_expired_message')}</p>
        </div>
        <Input label={t('current_password')} type="password" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
        <Input label={t('new_password')} type="password" autoComplete="new-password" value={form.new_password} onChange={set('new_password')} helperText={t('password_min_8')} />
        <Input label={t('confirm_password')} type="password" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
        {error && <p className="text-sm text-red-600 text-left">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>{saving ? t('saving') : t('change_password')}</Button>
        <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} className="block mx-auto text-sm text-gray-600 hover:underline">{t('sign_out')}</button>
      </form>
    </div>
  );
}
