// FILE PATH: frontend/src/pages/messaging/Templates.jsx
import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { ConfirmModal, Button, Input, Textarea } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { smsParts } from './common';
import { t } from '../../utils/i18n';

export default function Templates() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);           // { id? }
  const [form, setForm] = useState({ name: '', content: '' });
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const manage = can('manage_templates');
  const load = useCallback(async () => { try { setLoading(true); setRows(await messagingService.templates()); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name.trim() || !form.content.trim()) { showError(t('template_name_and_content_required', lang)); return; }
    try { setSaving(true); const body = { name: form.name.trim(), content: form.content.trim() }; if (modal.id) await messagingService.updateTemplate(modal.id, body); else await messagingService.createTemplate(body); showSuccess(t(modal.id ? 'template_updated' : 'template_saved', lang)); setModal(null); load(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await messagingService.deleteTemplate(confirm.id); showSuccess(r.message); load(); } catch (err) { showError(err.message); } setConfirm(null); };
  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('templates', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('templates_description', lang)}</p></div>{manage && <Button onClick={() => { setForm({ name: '', content: '' }); setModal({}); }} mobileLabel={t('new_template', lang)}>{t('new_template', lang)}</Button>}</div>
        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && rows.length === 0 && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('ui_nothing_yet', lang)}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{rows.map((r) => (
          <div key={r.id} className="bg-white rounded shadow p-4 text-left space-y-2"><h2 className="text-sm font-semibold text-gray-900">{r.name}</h2><p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">{r.content}</p><p className="text-[11px] text-gray-400">{r.content.length} {t('characters', lang)} · {smsParts(r.content)} {t(smsParts(r.content) === 1 ? 'sms_part' : 'sms_parts', lang)}</p>
            <div className="flex gap-3 text-xs"><button type="button" className="text-primary hover:underline" onClick={() => setView(r)}>{t('view', lang)}</button>{manage && <button type="button" className="text-gray-600 hover:underline" onClick={() => { setForm({ name: r.name, content: r.content }); setModal({ id: r.id }); }}>{t('edit', lang)}</button>}{manage && <button type="button" className="text-red-600 hover:underline" onClick={() => setConfirm({ id: r.id, name: r.name })}>{t('delete', lang)}</button>}</div></div>))}</div>
      </div>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="md" title={modal?.id ? t('edit_template', lang) : t('new_template', lang)}>
        {modal && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4 text-left" noValidate><Input label={t('template_name', lang)} required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><div><Textarea rows={5} label={t('template_content', lang)} required value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} /><p className="text-xs text-gray-500 mt-1">{form.content.length} {t('characters', lang)} · {smsParts(form.content)} {t(smsParts(form.content) === 1 ? 'sms_part' : 'sms_parts', lang)}</p></div><div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t(modal.id ? 'save_changes' : 'save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('cancel', lang)}</Button></div></form>}
      </FormModal>
      <FormModal isOpen={!!view} onClose={() => setView(null)} size="sm" title={view?.name}>{view && <div className="space-y-3 text-left"><p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded p-3">{view.content}</p><div className="flex justify-end"><Button variant="secondary" onClick={() => setView(null)}>{t('close', lang)}</Button></div></div>}</FormModal>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
