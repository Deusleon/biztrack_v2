// FILE PATH: frontend/src/pages/profile/Profile.jsx
import { useState, useEffect, useRef } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { profileService } from '../../services/api';
import { Input, PhoneInput, Select, Button } from '../../components/ui';
import { uploadImageToCloudinary } from '../../utils/cloudinary';
import { formatDateLocalized } from '../../utils/formatDateLocalized';
import { t } from '../../utils/i18n';

const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function Profile() {
  const { user, updateUser, updateSessionAfterPasswordChange } = useAuth();
  const { showSuccess, showError } = useToast();
  const { lang, setLang } = useLanguage();
  const { settings } = useStoreSettings();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', preferred_language: 'en' });
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const expired = !!user?.password_change_required;

  useEffect(() => {
    profileService.get().then((res) => {
      setProfile(res.data);
      setForm({ name: res.data.name || '', email: res.data.email || '', phone: res.data.phone || '', preferred_language: res.data.preferred_language || 'en' });
    }).catch(() => showError(t('failed_to_load_profile', lang)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showError(t('name_required', lang));
    if (!form.email.trim()) return showError(t('email_required', lang));
    try {
      setSaving(true);
      const res = await profileService.update({ name: form.name.trim(), email: form.email.trim(), phone: form.phone || undefined, preferred_language: form.preferred_language });
      setProfile((p) => ({ ...p, ...res.profile }));
      updateUser({ name: res.profile.name, email: res.profile.email, preferred_language: res.profile.preferred_language, avatar_url: res.profile.avatar_url });
      if (res.profile.preferred_language && res.profile.preferred_language !== lang) setLang(res.profile.preferred_language);
      showSuccess(res.message || t('profile_updated', lang));
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showError(t('only_images_allowed', lang));
    if (file.size > 5 * 1024 * 1024) return showError(t('file_too_large', lang));
    try {
      setAvatarBusy(true);
      const up = await uploadImageToCloudinary({ file });
      const res = await profileService.setAvatar(up.url, up.public_id);
      setProfile((p) => ({ ...p, avatar_url: res.avatar_url || up.url }));
      updateUser({ avatar_url: res.avatar_url || up.url });
      showSuccess(t('avatar_updated', lang));
    } catch (err) { showError(err.message || t('something_went_wrong', lang)); }
    finally { setAvatarBusy(false); }
  };

  const removeAvatar = async () => {
    try { setAvatarBusy(true); await profileService.removeAvatar(); setProfile((p) => ({ ...p, avatar_url: null })); updateUser({ avatar_url: null }); showSuccess(t('avatar_removed', lang)); }
    catch (err) { showError(err.message); }
    finally { setAvatarBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!pw.current_password) return showError(t('current_password_required', lang));
    if (!pw.new_password) return showError(t('new_password_required', lang));
    if (pw.new_password.length < 8) return showError(t('password_min_8_chars', lang));
    if (pw.new_password !== pw.confirm_password) return showError(t('passwords_do_not_match', lang));
    try {
      setPwSaving(true);
      const res = await profileService.changePassword({ current_password: pw.current_password, new_password: pw.new_password });
      updateSessionAfterPasswordChange({ token: res.token, security: res.security });
      showSuccess(t('password_changed', lang));
      setPw({ current_password: '', new_password: '', confirm_password: '' });
      setPwOpen(false);
    } catch (err) { showError(err.message || t('something_went_wrong', lang)); }
    finally { setPwSaving(false); }
  };

  const setF = (f) => (e) => setForm((x) => ({ ...x, [f]: e.target.value }));
  const setP = (f) => (e) => setPw((x) => ({ ...x, [f]: e.target.value }));

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left">
          <h1 className="text-xl font-bold text-gray-900">{t('my_profile', lang)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('manage_your_personal_info', lang)}</p>
        </div>

        {expired && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded p-3 text-left">{t('password_expired_change_required', lang)}</div>}

        <div className="bg-white rounded shadow p-5 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
              : <span className="w-20 h-20 rounded-full gradient-primary text-white text-2xl font-semibold flex items-center justify-center">{initials(profile?.name || user?.name)}</span>}
          </div>
          <div className="text-left min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{profile?.name || user?.name}</h2>
            <p className="text-sm text-gray-500 truncate">{profile?.email || user?.email}</p>
            <p className="text-xs text-gray-400 mt-1">{user?.storeInfo?.role_name}{profile?.created_at ? ` · ${t('joined', lang)}: ${formatDateLocalized(profile.created_at, settings)}` : ''}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm" variant="secondary" loading={avatarBusy} onClick={() => fileRef.current?.click()}>{t('upload_avatar', lang)}</Button>
              {profile?.avatar_url && <Button size="sm" variant="ghost" disabled={avatarBusy} onClick={removeAvatar}>{t('remove_avatar', lang)}</Button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </div>
        </div>

        <form onSubmit={save} className="bg-white rounded shadow p-5 space-y-4" noValidate>
          <h3 className="text-base font-semibold text-gray-900 text-left">{t('edit_profile', lang)}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('full_name', lang)} required value={form.name} onChange={setF('name')} />
            <Input type="email" label={t('email', lang)} required value={form.email} onChange={setF('email')} />
            <PhoneInput label={t('phone', lang)} name="phone" value={form.phone} onChange={setF('phone')} />
            <Select label={t('preferred_language', lang)} value={form.preferred_language} onChange={setF('preferred_language')} options={[{ value: 'en', label: 'English' }, { value: 'sw', label: 'Kiswahili' }]} />
          </div>
          <div className="flex justify-end"><Button type="submit" loading={saving}>{t('save_changes', lang)}</Button></div>
        </form>

        <div className="bg-white rounded shadow p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-left">
              <h3 className="text-base font-semibold text-gray-900">{t('change_password', lang)}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{t('password_security_tip', lang)}</p>
            </div>
            {!pwOpen && <Button variant="secondary" size="sm" onClick={() => setPwOpen(true)}>{t('change', lang)}</Button>}
          </div>
          {pwOpen && (
            <form onSubmit={changePassword} className="space-y-4" noValidate>
              <Input type="password" label={t('current_password', lang)} required autoComplete="current-password" value={pw.current_password} onChange={setP('current_password')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input type="password" label={t('new_password', lang)} required autoComplete="new-password" value={pw.new_password} onChange={setP('new_password')} helperText={t('min_8_characters', lang)} />
                <Input type="password" label={t('confirm_password', lang)} required autoComplete="new-password" value={pw.confirm_password} onChange={setP('confirm_password')} error={pw.confirm_password && pw.new_password !== pw.confirm_password ? t('passwords_do_not_match', lang) : undefined} />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="submit" loading={pwSaving}>{t('save_password', lang)}</Button>
                <Button type="button" variant="secondary" onClick={() => setPwOpen(false)}>{t('ui_cancel', lang)}</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
