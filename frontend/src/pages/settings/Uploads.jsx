// FILE PATH: frontend/src/pages/settings/Uploads.jsx
import { useState, useEffect, useRef } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { settingsAdminService } from '../../services/api';
import { Button, ConfirmModal } from '../../components/ui';
import { t } from '../../utils/i18n';

const ASSETS = [{ key: 'logo', label: 'company_logo', desc: 'company_logo_desc' }, { key: 'receipt_header', label: 'receipt_header', desc: 'receipt_header_desc' }, { key: 'favicon', label: 'favicon', desc: 'favicon_desc' }];
const MAX_MB = 5;
const urlOf = (v) => (typeof v === 'string' ? v : v?.url || v?.secure_url || '');

export default function Uploads() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [branding, setBranding] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const refs = useRef({});
  const canManage = can('manage_uploads');
  const load = () => settingsAdminService.getBranding().then(setBranding).catch((err) => showError(err.message)).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); load(); }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (key, e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!f.type.startsWith('image/')) { showError(t('only_images_allowed', lang)); return; }
    if (f.size > MAX_MB * 1024 * 1024) { showError(t('file_too_large', lang)); return; }
    try { setBusy(key); const r = await settingsAdminService.uploadBranding(key, f); showSuccess(r.message || 'asset_uploaded'); await load(); } catch (err) { showError(err.message); } finally { setBusy(null); }
  };
  const remove = async () => { try { setBusy(confirm.key); const r = await settingsAdminService.removeBranding(confirm.key); showSuccess(r.message || 'asset_removed'); await load(); } catch (err) { showError(err.message); } finally { setBusy(null); setConfirm(null); } };

  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('uploads', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('uploads_desc', lang)}</p></div>
        {!canManage && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('view_only_mode', lang)}</p>}
        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{ASSETS.map((a) => { const url = urlOf(branding[a.key]); return (
          <div key={a.key} className="bg-white rounded shadow p-4 text-left space-y-3"><div><h2 className="text-sm font-semibold text-gray-800">{t(a.label, lang)}</h2><p className="text-xs text-gray-500">{t(a.desc, lang)}</p></div>
            <div className="h-28 rounded border border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">{url ? <img src={url} alt={t(a.label, lang)} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-400">{t('no_image', lang)}</span>}</div>
            {canManage && <div className="flex gap-2"><input ref={(el) => { refs.current[a.key] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => pick(a.key, e)} /><Button variant="secondary" loading={busy === a.key} onClick={() => refs.current[a.key]?.click()}>{url ? t('replace', lang) : t('upload', lang)}</Button>{url && <Button variant="secondary" disabled={busy === a.key} onClick={() => setConfirm({ key: a.key, name: t(a.label, lang) })}>{t('remove', lang)}</Button>}</div>}
          </div>); })}</div>}
      </div>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('remove', lang)} confirmText={t('remove', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
