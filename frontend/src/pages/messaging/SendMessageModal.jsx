// FILE PATH: frontend/src/pages/messaging/SendMessageModal.jsx
import { useState, useEffect } from 'react';
import FormModal from '../../components/ui/FormModal';
import { Button, Select, Textarea } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { messagingService } from '../../services/api';
import { normalizePhone, smsParts } from './common';
import { t } from '../../utils/i18n';

/** Send an SMS to typed numbers, or to a group (optionally its subgroups too). `group` pre-selects a group. */
export default function SendMessageModal({ isOpen, onClose, group, groups = [], onSent }) {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [mode, setMode] = useState('individual');
  const [numbers, setNumbers] = useState('');
  const [groupId, setGroupId] = useState('');
  const [sub, setSub] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { if (isOpen) { setMode(group ? 'group' : 'individual'); setGroupId(group ? String(group.id) : ''); setNumbers(''); setMessage(''); messagingService.templates().then(setTemplates).catch(() => {}); } }, [isOpen, group]);

  const parts = smsParts(message);
  const phones = numbers.split(/[\s,;]+/).filter(Boolean);
  const valid = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  const invalid = phones.filter((p) => !normalizePhone(p));
  const send = async () => {
    if (!message.trim()) { showError(t('message_required', lang)); return; }
    try {
      setSending(true);
      let r;
      if (mode === 'group') { if (!groupId) { showError(t('select_group_or_subgroup', lang)); return; } r = await messagingService.sendToGroup(groupId, { message: message.trim(), includeSubgroups: sub }); }
      else { if (valid.length === 0) { showError(t('invalid_phone_number', lang)); return; } if (invalid.length) { showError(`${t('invalid_phone_number', lang)}: ${invalid.join(', ')}`); return; } r = await messagingService.send({ contacts: valid, message: message.trim() }); }
      showSuccess(r.message || t('sms_sent_successfully', lang)); onSent?.(); onClose();
    } catch (err) { showError(err.message); } finally { setSending(false); }
  };

  return (
    <FormModal isOpen={isOpen} onClose={() => !sending && onClose()} size="md" title={t('send_message', lang)}>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4 text-left" noValidate>
        <div className="flex gap-2">{[['individual', 'individual_numbers'], ['group', 'group']].map(([k, label]) => <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 py-1.5 text-sm rounded border ${mode === k ? 'border-primary bg-primary-10 text-primary font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{t(label, lang)}</button>)}</div>
        {mode === 'individual'
          ? <div><Textarea rows={2} label={t('recipients', lang)} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="255712345678, 0713000111" /><p className="text-xs text-gray-500 mt-1">{t('recipients_hint', lang)}{valid.length > 0 && ` · ${valid.length}`}{invalid.length > 0 && <span className="text-red-600"> · {t('invalid_phone_number', lang)}: {invalid.join(', ')}</span>}</p></div>
          : <div className="space-y-2"><Select label={t('group_or_subgroup', lang)} value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder={t('select_group_or_subgroup', lang)} options={groups.map((g) => ({ value: String(g.id), label: `${g.parent_group_id ? '↳ ' : ''}${g.name} (${g.contact_count})` }))} /><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={sub} onChange={(e) => setSub(e.target.checked)} />{t('include_subgroups', lang)}</label></div>}
        {templates.length > 0 && <Select label={t('use_template_optional', lang)} value="" onChange={(e) => { const tpl = templates.find((x) => String(x.id) === e.target.value); if (tpl) setMessage(tpl.content); }} placeholder={t('select_template', lang)} options={templates.map((x) => ({ value: String(x.id), label: x.name }))} />}
        <div><Textarea rows={4} label={t('message', lang)} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('type_your_message', lang)} /><p className="text-xs text-gray-500 mt-1">{message.length} {t('characters', lang)} · {parts} {t(parts === 1 ? 'sms_part' : 'sms_parts', lang)}</p></div>
        <div className="flex justify-end gap-3"><Button type="submit" loading={sending}>{t('send', lang)}</Button><Button type="button" variant="secondary" onClick={onClose}>{t('cancel', lang)}</Button></div>
      </form>
    </FormModal>
  );
}
