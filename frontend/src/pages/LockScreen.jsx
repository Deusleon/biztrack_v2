// FILE PATH: frontend/src/pages/LockScreen.jsx
import { useState } from 'react';
import { useIdleLock } from '../contexts/IdleLockContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button, Input } from '../components/ui';
import { t } from '../utils/i18n';

/** Shown when the screen is locked (idle for too long, or locked by hand): the person types their password to continue. */
export default function LockScreen() {
  const { unlock } = useIdleLock();
  const { user, logout } = useAuth();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!password) { showError(t('password_required', lang)); return; }
    setLoading(true);
    const r = await unlock(password);
    if (!r.success) { setLoading(false); setPassword(''); showError(r.message || t('invalid_password', lang)); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded shadow-lg p-6 space-y-4 text-center">
        {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover mx-auto" /> : <span className="w-16 h-16 rounded-full gradient-primary text-white text-2xl font-semibold flex items-center justify-center mx-auto">{(user?.name || '?').slice(0, 1).toUpperCase()}</span>}
        <div><h1 className="text-lg font-bold text-gray-900">{t('session_locked', lang)}</h1><p className="text-sm text-gray-500 mt-1">{user?.name}</p><p className="text-xs text-gray-400 mt-0.5">{t('session_locked_hint', lang)}</p></div>
        <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('enter_password', lang)} aria-label={t('password', lang)} />
        <Button type="submit" loading={loading} className="w-full">{t('unlock', lang)}</Button>
        <button type="button" onClick={logout} className="text-xs text-gray-500 hover:underline">{t('sign_out_instead', lang)}</button>
      </form>
    </div>
  );
}
