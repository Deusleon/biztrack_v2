// FILE PATH: frontend/src/pages/messaging/Groups.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import SendMessageModal from './SendMessageModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { ConfirmModal, Button, Input, Select } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { normalizePhone } from './common';
import { t } from '../../utils/i18n';

export default function Groups() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);             // { id?, parentGroupId?, name }
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [open, setOpen] = useState(null);             // group whose members are shown
  const [members, setMembers] = useState([]);
  const [pick, setPick] = useState([]);
  const [newC, setNewC] = useState({ name: '', phone: '' });
  const [send, setSend] = useState(null);
  const manage = can('manage_groups'); const manageContacts = can('manage_contacts');
  const load = useCallback(async () => { try { setLoading(true); const [g, c] = await Promise.all([messagingService.groups(), messagingService.contacts()]); setGroups(g); setContacts(c); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const loadMembers = async (g) => { try { setMembers(await messagingService.groupContacts(g.id)); } catch (err) { showError(err.message); } };

  const tree = useMemo(() => groups.filter((g) => !g.parent_group_id).map((g) => ({ ...g, subs: groups.filter((s) => s.parent_group_id === g.id) })), [groups]);
  const save = async () => {
    if (!edit.name.trim()) { showError(t('group_name_required', lang)); return; }
    try { setSaving(true); if (edit.id) await messagingService.updateGroup(edit.id, { name: edit.name.trim() }); else await messagingService.createGroup({ name: edit.name.trim(), parentGroupId: edit.parentGroupId }); showSuccess(t(edit.id ? 'group_updated' : 'group_created', lang)); setEdit(null); load(); }
    catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await messagingService.deleteGroup(confirm.id); showSuccess(r.message); if (open?.id === confirm.id) setOpen(null); load(); } catch (err) { showError(err.message); } setConfirm(null); };
  const openGroup = (g) => { setOpen(g); setPick([]); setNewC({ name: '', phone: '' }); loadMembers(g); };
  const addPicked = async () => { try { const r = await messagingService.assignContacts(open.id, pick); showSuccess(r.message || t('contacts_added_to_group', lang)); setPick([]); await loadMembers(open); load(); } catch (err) { showError(err.message); } };
  const addNew = async () => {
    const phone = normalizePhone(newC.phone); if (!phone) { showError(t('invalid_phone_number', lang)); return; }
    try { await messagingService.createContact({ name: newC.name, phone, groupId: open.id }); showSuccess(t('contact_added', lang)); setNewC({ name: '', phone: '' }); await loadMembers(open); load(); } catch (err) { showError(err.message); }
  };
  const removeMember = async (c) => { try { const r = await messagingService.removeFromGroup(open.id, c.id); showSuccess(r.message); await loadMembers(open); load(); } catch (err) { showError(err.message); } };
  const outside = contacts.filter((c) => !members.some((m) => m.id === c.id));
  const row = (g, sub) => (
    <li key={g.id} className={`flex items-center justify-between gap-3 py-2.5 ${sub ? 'pl-8' : ''}`}>
      <button type="button" className="text-left min-w-0 flex-1" onClick={() => openGroup(g)}><span className="text-sm font-medium text-gray-900">{sub ? '↳ ' : ''}{g.name}</span><span className="ml-2 text-xs text-gray-500">{g.contact_count} {t('contacts', lang)}</span></button>
      <div className="flex gap-3 text-xs shrink-0">
        {can('manage_messaging') && <button type="button" className="text-primary hover:underline" onClick={() => setSend(g)}>{t('send', lang)}</button>}
        {manage && !sub && <button type="button" className="text-gray-600 hover:underline" onClick={() => setEdit({ parentGroupId: g.id, name: '' })}>+ {t('subgroup', lang)}</button>}
        {manage && <button type="button" className="text-gray-600 hover:underline" onClick={() => setEdit({ id: g.id, name: g.name })}>{t('edit', lang)}</button>}
        {manage && <button type="button" className="text-red-600 hover:underline" onClick={() => setConfirm({ id: g.id, name: g.name })}>{t('delete', lang)}</button>}
      </div>
    </li>
  );
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('groups', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('groups_description', lang)}</p></div>{manage && <Button onClick={() => setEdit({ name: '' })} mobileLabel={t('new_group', lang)}>{t('new_group', lang)}</Button>}</div>
        {loading && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {!loading && tree.length === 0 && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('no_groups_yet', lang)}</div>}
        {tree.length > 0 && <ul className="bg-white rounded shadow px-5 divide-y divide-gray-100">{tree.flatMap((g) => [row(g, false), ...g.subs.map((s) => row(s, true))])}</ul>}
      </div>

      <FormModal isOpen={!!edit} onClose={() => !saving && setEdit(null)} size="md" title={edit?.id ? t(groups.find((g) => g.id === edit.id)?.parent_group_id ? 'edit_subgroup' : 'edit_group', lang) : t(edit?.parentGroupId ? 'new_subgroup_name' : 'new_group', lang)}>
        {edit && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>{edit.parentGroupId && <p className="text-xs text-gray-500 text-left">{t('under_group', lang)}: <b>{groups.find((g) => g.id === edit.parentGroupId)?.name}</b></p>}<Input label={t('group_name', lang)} required autoFocus value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t('save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setEdit(null)}>{t('cancel', lang)}</Button></div></form>}
      </FormModal>

      <FormModal isOpen={!!open} onClose={() => setOpen(null)} size="xl" title={`${t('contacts_in_group', lang)} · ${open?.name || ''}`}>
        {open && (
          <div className="space-y-4 text-left">
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded max-h-56 overflow-auto">{members.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">{t('no_contacts_yet', lang)}</li>}{members.map((c) => <li key={c.id} className="px-3 py-1.5 flex items-center justify-between gap-3 text-sm"><span>{c.name ? `${c.name} · ` : ''}{c.phone}</span>{manageContacts && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeMember(c)}>{t('remove_from_group', lang)}</button>}</li>)}</ul>
            {manageContacts && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><p className="text-sm font-medium text-gray-700">{t('add_from_list', lang)}</p>{outside.length === 0 ? <p className="text-xs text-gray-400">{t('all_contacts_already_in_group', lang)}</p> : <><ul className="max-h-36 overflow-auto border border-gray-200 rounded divide-y divide-gray-100">{outside.map((c) => <li key={c.id}><label className="flex items-center gap-2 px-3 py-1 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={pick.includes(c.id)} onChange={() => setPick((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />{c.name ? `${c.name} · ` : ''}{c.phone}</label></li>)}</ul><Button variant="secondary" disabled={pick.length === 0} onClick={addPicked}>{t('add_selected', lang)} ({pick.length})</Button></>}</div>
              <div className="space-y-2"><p className="text-sm font-medium text-gray-700">{t('add_new', lang)}</p><Input value={newC.name} onChange={(e) => setNewC((x) => ({ ...x, name: e.target.value }))} placeholder={t('enter_contact_name', lang)} /><Input value={newC.phone} onChange={(e) => setNewC((x) => ({ ...x, phone: e.target.value }))} placeholder="255712345678" /><Button variant="secondary" disabled={!newC.phone.trim()} onClick={addNew}>{t('add_contact', lang)}</Button></div></div>}
            <div className="flex justify-end gap-3">{can('manage_messaging') && <Button onClick={() => { setSend(open); }}>{t('send_bulk_sms_to_group', lang)}</Button>}<Button variant="secondary" onClick={() => setOpen(null)}>{t('close', lang)}</Button></div>
          </div>
        )}
      </FormModal>
      <SendMessageModal isOpen={!!send} group={send} groups={groups} onClose={() => setSend(null)} onSent={load} />
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
