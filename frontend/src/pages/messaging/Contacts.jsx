// FILE PATH: frontend/src/pages/messaging/Contacts.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { DataTable, ConfirmModal, Button, Input, Select, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import SendMessageModal from './SendMessageModal';
import { normalizePhone } from './common';
import { t } from '../../utils/i18n';

const PAGE = 25;
export default function Contacts() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);           // { id? }
  const [form, setForm] = useState({ name: '', phone: '', groupIds: [] });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [compose, setCompose] = useState(null);
  const manage = can('manage_contacts');
  const canSend = can('manage_messaging');
  const load = useCallback(async () => { try { setLoading(true); const [c, g] = await Promise.all([messagingService.contacts(), messagingService.groups()]); setRows(c); setGroups(g); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => { const q = search.trim().toLowerCase(); return rows.filter((c) => (!groupFilter || c.groups.some((g) => String(g.id) === groupFilter)) && (!q || `${c.name || ''} ${c.phone}`.toLowerCase().includes(q))); }, [rows, search, groupFilter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)); const cur = Math.min(page, pages);
  const openNew = () => { setForm({ name: '', phone: '', groupIds: [] }); setModal({}); };
  const openEdit = (c) => { setForm({ name: c.name || '', phone: c.phone, groupIds: c.groups.map((g) => g.id) }); setModal({ id: c.id }); };
  const toggle = (id) => setForm((f) => ({ ...f, groupIds: f.groupIds.includes(id) ? f.groupIds.filter((x) => x !== id) : [...f.groupIds, id] }));

  const save = async () => {
    const phone = normalizePhone(form.phone);
    if (!form.phone.trim()) { showError(t('phone_required', lang)); return; }
    if (!phone) { showError(t('invalid_phone_number', lang)); return; }
    try {
      setSaving(true);
      let id = modal.id;
      if (id) await messagingService.updateContact(id, { name: form.name, phone }); else id = (await messagingService.createContact({ name: form.name, phone })).id;
      await messagingService.setContactGroups(id, form.groupIds);
      showSuccess(t(modal.id ? 'contact_updated' : 'contact_added', lang)); setModal(null); load();
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { const r = await messagingService.deleteContact(confirm.id); showSuccess(r.message); load(); } catch (err) { showError(err.message); } setConfirm(null); };

  const columns = [
    { key: 'name', label: t('name', lang), render: (c) => <span className="font-medium text-gray-900">{c.name || <span className="text-gray-400">—</span>}</span> },
    { key: 'phone', label: t('phone', lang) },
    { key: 'groups', label: t('groups', lang), render: (c) => (c.groups.length ? <div className="flex flex-wrap gap-1">{c.groups.map((g) => <span key={g.id} className="px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700">{g.name}</span>)}</div> : <span className="text-gray-400">—</span>) },
  ];
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('all_contacts', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('all_contacts_desc', lang)}</p></div>
          <div className="flex items-center gap-3">{can('view_bulk_operations') && <Link to="/settings/bulk-operations" className="text-sm text-primary hover:underline">{t('bulk_operations', lang)}</Link>}{manage && <Button onClick={openNew} mobileLabel={t('add_contact', lang)}>{t('add_contact', lang)}</Button>}</div></div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('ui_search_placeholder', lang)} /><Select searchable value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }} options={[{ value: '', label: t('all_groups', lang) }, ...groups.map((g) => ({ value: String(g.id), label: `${g.parent_group_id ? '↳ ' : ''}${g.name}` }))]} /></div>
        <DataTable columns={columns} data={shown.slice((cur - 1) * PAGE, cur * PAGE)} loading={loading} emptyMessage={search || groupFilter ? t('ui_nothing_matches', lang) : t('no_contacts_yet', lang)} pagination={{ currentPage: cur, totalPages: pages, totalItems: shown.length, limit: PAGE }} onPageChange={setPage}
          renderActions={(manage || canSend) ? (c) => <RowActions actions={[
            { label: t('send_sms', lang), icon: ACTION_ICONS.send, onClick: () => setCompose(c), hidden: !canSend },
            { label: t('edit', lang), icon: ACTION_ICONS.edit, onClick: () => openEdit(c), hidden: !manage },
            { label: t('delete', lang), icon: ACTION_ICONS.delete, variant: 'danger', onClick: () => setConfirm({ id: c.id, name: c.name || c.phone }), hidden: !manage },
          ]} /> : undefined} />
      </div>
      <FormModal isOpen={!!modal} onClose={() => !saving && setModal(null)} size="lg" title={modal?.id ? t('edit_contact', lang) : t('add_contact', lang)}>
        {modal && <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4 text-left" noValidate><Input label={t('contact_name_optional', lang)} autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><Input label={t('phone_number', lang)} required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="255712345678" helperText={t('tip_contact_phone_format', lang)} />
          {groups.length > 0 && <div><p className="text-sm font-medium text-gray-700 mb-1">{t('groups_optional', lang)}</p><ul className="max-h-40 overflow-auto border border-gray-200 rounded divide-y divide-gray-100">{groups.map((g) => <li key={g.id}><label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer" style={{ paddingLeft: g.parent_group_id ? 28 : 12 }}><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={form.groupIds.includes(g.id)} onChange={() => toggle(g.id)} />{g.name}</label></li>)}</ul></div>}
          <div className="flex justify-end gap-3"><Button type="submit" loading={saving}>{t(modal.id ? 'save_changes' : 'save', lang)}</Button><Button type="button" variant="secondary" onClick={() => setModal(null)}>{t('cancel', lang)}</Button></div></form>}
      </FormModal>
      <SendMessageModal isOpen={!!compose} initialNumbers={compose?.phone || ''} groups={groups} onClose={() => setCompose(null)} />
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
