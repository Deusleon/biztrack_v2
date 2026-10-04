// FILE PATH: frontend/src/pages/settings/Security.jsx
import { useState, useEffect } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { settingsAdminService } from '../../services/api';
import { Input, Button } from '../../components/ui';
import { t } from '../../utils/i18n';

const DEFAULTS = { sessionTimeout: 30, loginAttempts: 5, passwordExpiry: 90, accountLockMinutes: 15, auditLogging: true, dataEncryption: true };
const LIMITS = { sessionTimeout: [5, 480], loginAttempts: [1, 20], passwordExpiry: [0, 365], accountLockMinutes: [1, 1440] };
// how safe the chosen rules are (same idea as the original score): short sessions, few attempts, passwords that expire, audit on
const score = (s) => { let n = 0; if (s.auditLogging) n += 25; if (s.dataEncryption) n += 20; if (s.sessionTimeout <= 30) n += 20; else if (s.sessionTimeout <= 120) n += 10; if (s.loginAttempts <= 5) n += 20; else if (s.loginAttempts <= 10) n += 10; if (s.passwordExpiry > 0 && s.passwordExpiry <= 90) n += 15; else if (s.passwordExpiry > 0) n += 8; return n; };

export default function Security() {
  const { can, updateSecuritySettings } = useAuth();
  const { currentStore } = useStore();
  const { refetch } = useStoreSettings();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [s, setS] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = can('view_security') && can('edit_configurations');

  useEffect(() => { setLoading(true); settingsAdminService.getAll().then((r) => setS({ ...DEFAULTS, ...(r.storeSettings?.operations?.security || {}) })).catch((err) => showError(err.message)).finally(() => setLoading(false)); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }));

  const save = async () => {
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = Number(s[k]); if (!Number.isFinite(v) || v < lo || v > hi) { showError(`${t(`security_${k === 'accountLockMinutes' ? 'account_lock' : k === 'sessionTimeout' ? 'session_timeout' : k === 'loginAttempts' ? 'login_attempts' : 'password_expiry'}`, lang)}: ${lo}–${hi}`); return; } }
    try { setSaving(true); await settingsAdminService.update(currentStore.id, { operations: { security: s } }); updateSecuritySettings?.(s); showSuccess(t('security_settings_saved', lang)); await refetch?.(); }
    catch (err) { showError(err.message || t('failed_to_save_security_settings', lang)); } finally { setSaving(false); }
  };

  const n = score(s); const level = n >= 80 ? 'good' : n >= 50 ? 'fair' : 'poor';
  const tone = { good: 'text-green-700 bg-green-50 border-green-200', fair: 'text-amber-700 bg-amber-50 border-amber-200', poor: 'text-red-700 bg-red-50 border-red-200' }[level];
  const toggle = (k, label, desc) => <label key={k} className="flex items-center justify-between gap-3 py-3 border-b border-gray-100 text-left cursor-pointer"><span><span className="block text-sm text-gray-800">{t(label, lang)}</span><span className="block text-xs text-gray-500">{t(desc, lang)}</span></span><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!!s[k]} disabled={!canEdit} onChange={(e) => setS((x) => ({ ...x, [k]: e.target.checked }))} /></label>;

  return (
    <MainLayout>
      <div className="space-y-4 max-w-3xl">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('security_center', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('security_center_desc', lang)}</p></div>{canEdit && <Button onClick={save} loading={saving} disabled={loading}>{t('save_security', lang)}</Button>}</div>
        {!canEdit && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('view_only_mode', lang)}</p>}
        <div className={`rounded border p-4 flex items-center justify-between ${tone}`}><div className="text-left"><p className="text-xs uppercase tracking-wide opacity-70">{t('security_score', lang)}</p><p className="text-sm font-semibold">{t(level === 'good' ? 'security_level_good' : level === 'fair' ? 'security_level_fair' : 'security_level_needs_attention', lang)}</p></div><p className="text-3xl font-bold">{n}</p></div>
        <div className="bg-white rounded shadow p-5 space-y-4 text-left"><h2 className="text-sm font-semibold text-gray-800">{t('session_password_policies', lang)}</h2><p className="text-xs text-gray-500">{t('session_password_policies_desc', lang)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input type="number" label={`${t('security_session_timeout', lang)} (min)`} min={5} max={480} value={s.sessionTimeout} disabled={!canEdit} onChange={num('sessionTimeout')} helperText={t('security_session_timeout_desc', lang)} />
            <Input type="number" label={t('security_login_attempts', lang)} min={1} max={20} value={s.loginAttempts} disabled={!canEdit} onChange={num('loginAttempts')} helperText={t('security_login_attempts_desc', lang)} />
            <Input type="number" label={`${t('security_password_expiry', lang)} (days, 0 = never)`} min={0} max={365} value={s.passwordExpiry} disabled={!canEdit} onChange={num('passwordExpiry')} helperText={t('security_password_expiry_desc', lang)} />
            <Input type="number" label={`${t('security_account_lock', lang)} (min)`} min={1} max={1440} value={s.accountLockMinutes} disabled={!canEdit} onChange={num('accountLockMinutes')} />
          </div></div>
        <div className="bg-white rounded shadow p-5"><h2 className="text-sm font-semibold text-gray-800 text-left">{t('security_controls', lang)}</h2><p className="text-xs text-gray-500 text-left mb-1">{t('security_controls_desc', lang)}</p>{toggle('auditLogging', 'security_audit_logging', 'security_audit_logging_desc')}{toggle('dataEncryption', 'security_data_encryption', 'security_data_encryption_desc')}</div>
      </div>
    </MainLayout>
  );
}
