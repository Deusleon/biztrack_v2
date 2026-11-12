// FILE PATH: frontend/src/pages/LockScreen.jsx
import { useState } from 'react';
import { useIdleLock } from '../contexts/IdleLockContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import AuthShell from '../components/AuthShell';
import { Button, Input } from '../components/ui';
import { t } from '../utils/i18n';

/** Same frame as the login page: brand on the gradient, the form on a white card. */
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
    <AuthShell title={t('session_locked', lang)} subtitle={user?.name}>
      <form onSubmit={submit} className="space-y-4">
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover mx-auto" />
          : <span className="w-14 h-14 rounded-full gradient-primary text-white text-xl font-semibold flex items-center justify-center mx-auto">{(user?.name || '?').slice(0, 1).toUpperCase()}</span>}
        <p className="text-xs text-gray-500 text-center">{t('session_locked_hint', lang)}</p>
        <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('enter_password', lang)} aria-label={t('password', lang)} />
        <Button type="submit" loading={loading} className="w-full">{t('unlock', lang)}</Button>
        <button type="button" onClick={logout} className="block w-full text-xs text-gray-500 hover:underline">{t('sign_out_instead', lang)}</button>
      </form>
    </AuthShell>
  );
}
