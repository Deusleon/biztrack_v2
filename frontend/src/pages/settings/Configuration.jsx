// FILE PATH: frontend/src/pages/settings/Configuration.jsx
import { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import useDeveloperAccess from '../../hooks/useDeveloperAccess';
import { settingsAdminService, priceCategoryService } from '../../services/api';
import { clearPdfSettingsCache } from '../../utils/exportUtils';
import { Input, Select, Button } from '../../components/ui';
import { t } from '../../utils/i18n';

/**
 * The store's configuration. The server DESCRIBES the fields (settings.systemOptions: sections, field types, options, limits), so one
 * renderer draws all of them: business information (shared by the stores of the system and only editable from the PRIMARY store),
 * system defaults and operations (this store).
 */
export default function Configuration() {
  const { can } = useAuth();
  const { currentStore, stores } = useStore();
  const { refetch } = useStoreSettings();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [values, setValues] = useState({ business: {}, ops: {}, sys: {} });
  const [saving, setSaving] = useState(false);
  const canEdit = can('edit_configurations');
  const { isDeveloper } = useDeveloperAccess();
  const primary = !!values.ops.isPrimaryStore;

  useEffect(() => {
    let live = true; setData(null);
    Promise.all([settingsAdminService.getAll(), priceCategoryService.getAll().catch(() => ({ data: [] }))]).then(([r, pc]) => {
      if (!live) return;
      setData(r); setCats(pc.data);
      setValues({ business: { ...(r.systemSettings?.businessInfo || {}) }, ops: { ...(r.storeSettings?.operations || {}) }, sys: { ...(r.systemSettings?.systemDefaults || {}) } });
    }).catch((err) => showError(err.message));
    return () => { live = false; };
  }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    if (!data) return [];
    const sys = data.systemSettings?.systemOptions || []; const st = data.storeSettings?.systemOptions || [];
    const find = (list, id) => list.find((s) => s.id === id);
    const out = [];
    const biz = find(sys, 'businessInfo'); if (biz && can('view_business_info')) out.push({ ...biz, group: 'business' });
    const loc = find(st, 'localization'); if (loc && can('view_system_defaults')) {
      const fields = [{ key: 'defaultStore', type: 'select', label: 'default_store', dynamic: 'stores' }, ...loc.fields]
        .filter((f) => f.key !== 'defaultSmsGateway' || (isDeveloper && primary));
      const at = fields.findIndex((f) => f.key === 'defaultTaxRate'); fields.splice(at < 0 ? fields.length : at, 0, { key: 'defaultPriceCategory', type: 'select', label: 'default_price_category', dynamic: 'priceCategories' });
      // The SMS gateway is a developer setting on the primary store. The server ignores it for everyone else.
      if (isDeveloper && primary && !fields.some((f) => f.key === 'defaultSmsGateway')) {
        fields.push({
          key: 'defaultSmsGateway', type: 'select', label: 'default_sms_gateway',
          options: [{ label: 'Beem Africa', value: 'beem_africa' }, { label: 'NextSMS', value: 'next_sms' }, { label: 'Meseji', value: 'meseji' }, { label: 'SwalaSMS', value: 'swala_sms' }],
        });
      }
      out.push({ ...loc, fields, group: 'ops' });
    }
    const op = find(st, 'operations'); if (op && can('view_system_operations')) out.push({ ...op, group: 'ops' });
    return out;
  }, [data, can, isDeveloper, primary]);

  const isSystemKey = (k) => ['defaultStore', 'multiStoreSupport', 'interStoreTransfer', 'defaultSmsGateway'].includes(k);
  const read = (group, k) => (group === 'business' ? values.business[k] : isSystemKey(k) ? values.sys[k] : values.ops[k]);
  const write = (group, k, v) => setValues((x) => (group === 'business' ? { ...x, business: { ...x.business, [k]: v } } : isSystemKey(k) ? { ...x, sys: { ...x.sys, [k]: v } } : { ...x, ops: { ...x.ops, [k]: v } }));
  const save = async () => {
    const o = values.ops;
    if (primary && !String(values.business.businessName || '').trim()) { showError(t('business_name_required', lang)); return; }
    try {
      setSaving(true);
      const r = await settingsAdminService.update(currentStore.id, { operations: { ...o }, systemDefaults: { ...values.sys }, businessInfo: primary ? values.business : undefined });
      showSuccess(r.message || 'settings_updated'); clearPdfSettingsCache(); await refetch?.();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const optionsOf = (f) => (f.dynamic === 'stores' ? stores.map((s) => ({ value: s.id, label: s.name })) : f.dynamic === 'priceCategories' ? cats.map((c) => ({ value: c.id, label: c.name })) : (f.options || []).map((o) => ({ value: o.value, label: t(o.label, lang) })));

  const renderField = (group, f, disabled) => {
    const v = read(group, f.key); const label = t(f.label, lang);
    if (f.type === 'checkbox') return <label key={f.key} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 text-sm text-left cursor-pointer"><span className="text-gray-700">{label}</span><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!!v} disabled={disabled} onChange={(e) => write(group, f.key, e.target.checked)} /></label>;
    if (f.type === 'select') return <Select key={f.key} label={label} value={v ?? ''} disabled={disabled} onChange={(e) => write(group, f.key, e.target.value)} options={optionsOf(f)} placeholder={t('select', lang)} />;
    if (f.type === 'number' || f.type === 'percentage') return <Input key={f.key} type="number" label={`${label}${f.type === 'percentage' ? ' (%)' : ''}`} min={f.min} max={f.max} value={v ?? ''} disabled={disabled} onChange={(e) => write(group, f.key, e.target.value === '' ? '' : Number(e.target.value))} />;
    return <Input key={f.key} label={label} required={!!f.required} placeholder={f.placeholder ? t(f.placeholder, lang) : undefined} value={v ?? ''} disabled={disabled} onChange={(e) => write(group, f.key, e.target.value)} />;
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('configurations', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{currentStore?.name}</p></div>
          {canEdit && <Button onClick={save} loading={saving} disabled={!data}>{t('save_changes', lang)}</Button>}
        </div>
        {!canEdit && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-left">{t('view_only_mode', lang)}</p>}
        {!data && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {sections.map((sec) => {
          const isBiz = sec.group === 'business'; const disabled = !canEdit || (isBiz && !primary);
          const visible = sec.fields.filter((f) => f.type !== 'image' && f.key !== 'logo' && f.key !== 'businessLogo');
          if (visible.length === 0) return null;
          const checks = visible.filter((f) => f.type === 'checkbox'); const others = visible.filter((f) => f.type !== 'checkbox');
          return (
            <div key={sec.id} className="bg-white rounded shadow">
              <div className="px-5 py-3 border-b border-gray-100 text-left"><h2 className="text-sm font-semibold text-gray-800">{t(sec.title, lang) === sec.title ? sec.title : t(sec.title, lang)}</h2>{isBiz && !primary && <p className="text-xs text-gray-500 mt-0.5">{t('business_info_primary_only', lang)}</p>}</div>
              <div className="p-5 space-y-4">
                {others.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{others.map((f) => renderField(sec.group, f, disabled))}</div>}
                {checks.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">{checks.map((f) => renderField(sec.group, f, disabled))}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </MainLayout>
  );
}
