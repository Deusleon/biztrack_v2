// FILE PATH: frontend/src/components/SupportWidget.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FormModal from './ui/FormModal';
import { Button, Input, Select, Textarea } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supportService } from '../services/api';
import { t } from '../utils/i18n';

const CATEGORIES = ['question', 'bug', 'billing', 'feature_request', 'other'];
const when = (v) => (v ? new Date(v).toLocaleString() : '—');

/** "Help & support" for everybody signed in: write to the BizTrack team and follow your own tickets and their answers. */
export default function SupportWidget({ isOpen, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [tab, setTab] = useState('new');
  const [form, setForm] = useState({ category: 'question', subject: '', message: '' });
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const load = () => supportService.myTickets().then(setMine).catch(() => {});
  useEffect(() => { if (isOpen) { setTab('new'); load(); } }, [isOpen]);
  useEffect(() => { supportService.adminAccess().then(() => setIsAdmin(true)).catch(() => setIsAdmin(false)); }, [user?.id]);
  const send = async () => {
    if (!form.subject.trim() || !form.message.trim()) { showError(t('required_field', lang)); return; }
    try { setBusy(true); const r = await supportService.createTicket({ name: user?.name, email: user?.email, phone: user?.phone || undefined, category: form.category, subject: form.subject.trim(), message: form.message.trim(), context: { page: window.location.pathname, store: currentStore?.name } }); showSuccess(r.message || t('ticket_created', lang)); setForm({ category: 'question', subject: '', message: '' }); await load(); setTab('mine'); }
    catch (err) { showError(err.message); } finally { setBusy(false); }
  };
  return (
    <FormModal isOpen={isOpen} onClose={onClose} size="xl" title={t('help_and_support', lang)}>
      <div className="space-y-4 text-left">
        <div className="flex gap-2 border-b border-gray-200">{[['new', 'new_ticket'], ['mine', 'my_tickets']].map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>{t(label, lang)}{k === 'mine' && mine.length > 0 ? ` (${mine.length})` : ''}</button>)}</div>
        {tab === 'new' ? (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-3" noValidate><Select label={t('category', lang)} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} options={CATEGORIES.map((c) => ({ value: c, label: t(c, lang) }))} /><Input label={t('subject', lang)} required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /><Textarea rows={5} label={t('message', lang)} required value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} /><div className="flex justify-end gap-3"><Button type="submit" loading={busy}>{t('send', lang)}</Button><Button type="button" variant="secondary" onClick={onClose}>{t('close', lang)}</Button></div></form>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-auto">{mine.length === 0 && <li className="text-sm text-gray-400 text-center py-6">{t('ui_nothing_yet', lang)}</li>}{mine.map((x) => <li key={x.ticket_number} className="border border-gray-100 rounded p-3 space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-gray-900">{x.subject}</span><span className="text-xs text-gray-500">{t(x.status, lang)}</span></div><p className="text-[11px] text-gray-400">{x.ticket_number} · {when(x.created_at)}</p>{(x.replies || []).map((r, i) => <p key={i} className="text-sm bg-primary-10 rounded p-2 whitespace-pre-wrap">{r.message}</p>)}</li>)}</ul>
        )}
        {isAdmin && <button type="button" onClick={() => { onClose(); navigate('/support/admin'); }} className="w-full text-center text-sm font-medium text-primary bg-primary-10 rounded py-2 hover:bg-primary-20">{t('open_support_admin', lang)}</button>}
      </div>
    </FormModal>
  );
}
