// FILE PATH: frontend/src/pages/support/SupportAdmin.jsx
import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supportService } from '../../services/api';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { t } from '../../utils/i18n';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const TONE = { open: 'bg-red-50 text-red-700', in_progress: 'bg-amber-50 text-amber-700', resolved: 'bg-green-50 text-green-700', closed: 'bg-gray-100 text-gray-600' };
const when = (v) => (v ? new Date(v).toLocaleString() : '—');
const span = (sec, lang) => { if (sec == null) return '—'; const m = Math.round(sec / 60); return m < 60 ? `${m} ${t('minutes_short', lang)}` : m < 1440 ? `${(m / 60).toFixed(1)} ${t('hours_short', lang)}` : `${(m / 1440).toFixed(1)} ${t('days', lang)}`; };

/** The help desk for the people who run BizTrack (SUPPORT_ADMIN_EMAILS): every ticket from every store, reply, internal notes, status. */
export default function SupportAdmin() {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const [allowed, setAllowed] = useState(null);
  const [stats, setStats] = useState(null);
  const [list, setList] = useState({ tickets: [], total: 0, page: 1, limit: 20, counts: {} });
  const [filters, setFilters] = useState({ status: '', category: '', search: '', page: 1 });
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { supportService.adminAccess().then(() => setAllowed(true)).catch(() => setAllowed(false)); }, []);
  const load = useCallback(async () => { try { setLoading(true); const [l, s] = await Promise.all([supportService.adminList({ ...filters, limit: 20 }), supportService.adminStats()]); setList(l); setStats(s); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (allowed) { const id = setTimeout(load, 250); return () => clearTimeout(id); } return undefined; }, [allowed, load]);
  useLiveRefresh(['supportTicketCreated', 'supportTicketUpdated'], () => { if (allowed) load(); });

  const open = async (id) => { try { setTicket(await supportService.adminGet(id)); setReply(''); setInternal(false); } catch (err) { showError(err.message || t('ticket_load_failed', lang)); } };
  const setStatus = async (status) => { try { await supportService.adminSetStatus(ticket.id, status); showSuccess(t('ticket_status_updated', lang)); await open(ticket.id); load(); } catch (err) { showError(err.message || t('ticket_update_failed', lang)); } };
  const send = async () => { if (!reply.trim()) return; try { setBusy(true); await supportService.adminReply(ticket.id, reply.trim(), internal); showSuccess(t(internal ? 'internal_note_saved' : 'reply_sent', lang)); setReply(''); await open(ticket.id); load(); } catch (err) { showError(err.message); } finally { setBusy(false); } };

  if (allowed === false) return <MainLayout><div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('no_permission', lang)}</div></MainLayout>;
  const pages = Math.max(1, Math.ceil((list.total || 0) / (list.limit || 20)));
  const card = (label, value) => <div className="bg-white p-4 rounded shadow text-left"><p className="text-xs uppercase tracking-wide text-gray-400">{label}</p><p className="text-lg font-bold text-gray-900 mt-1">{value}</p></div>;
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('support_admin', lang)}</h1></div>
        {stats && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{card(t('open_tickets', lang), stats.counts?.open ?? 0)}{card(t('open_over_24h', lang), stats.open_over_24h)}{card(t('avg_first_response', lang), span(stats.avg_first_response_seconds, lang))}{card(t('avg_resolution_time', lang), span(stats.avg_resolution_seconds, lang))}{card(t('tickets_last_7_days', lang), stats.last_7_days)}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white p-3 rounded shadow space-y-2"><Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))} placeholder={t('search_tickets_placeholder', lang)} /><div className="flex gap-2"><Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))} options={[{ value: '', label: t('all', lang) }, ...STATUSES.map((s) => ({ value: s, label: `${t(s, lang)} (${list.counts?.[s] ?? 0})` }))]} /></div></div>
            <ul className="bg-white rounded shadow divide-y divide-gray-100 max-h-[60vh] overflow-auto">
              {loading && <li className="p-6 text-center text-sm text-gray-400">{t('loading_data', lang)}</li>}
              {!loading && list.tickets.length === 0 && <li className="p-6 text-center text-sm text-gray-400">{t('no_data', lang)}</li>}
              {list.tickets.map((x) => <li key={x.id}><button type="button" onClick={() => open(x.id)} className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 ${ticket?.id === x.id ? 'bg-primary-10' : ''}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-gray-900 truncate">{x.subject}</span><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TONE[x.status]}`}>{t(x.status, lang)}</span></div><p className="text-xs text-gray-500 truncate">{x.ticket_number} · {x.name || t('guest', lang)} · {x.store_name || x.account_name || '—'}</p><p className="text-[11px] text-gray-400">{when(x.created_at)} · {x.reply_count} {t('replies', lang)}</p></button></li>)}
            </ul>
            <div className="flex items-center justify-between text-xs text-gray-500"><Button variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>{t('previous', lang)}</Button><span>{filters.page} / {pages}</span><Button variant="secondary" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>{t('next', lang)}</Button></div>
          </div>
          <div className="lg:col-span-3">
            {!ticket ? <div className="bg-white rounded shadow p-10 text-center text-sm text-gray-400">{t('select_ticket_to_view', lang)}</div> : (
              <div className="bg-white rounded shadow p-5 text-left space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap"><div><h2 className="text-base font-bold text-gray-900">{ticket.subject}</h2><p className="text-xs text-gray-500">{ticket.ticket_number} · {ticket.name} · {ticket.email}{ticket.phone ? ` · ${ticket.phone}` : ''} · {ticket.store_name}</p></div><Select value={ticket.status} onChange={(e) => setStatus(e.target.value)} options={STATUSES.map((s) => ({ value: s, label: t(s, lang) }))} /></div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded p-3">{ticket.message}</p>
                <ul className="space-y-2">{(ticket.replies || []).map((r) => <li key={r.id} className={`rounded p-3 text-sm ${r.is_internal ? 'bg-amber-50 border border-amber-200' : r.is_staff || r.author_type === 'staff' ? 'bg-primary-10' : 'bg-gray-50 border border-gray-100'}`}><p className="text-[11px] text-gray-500 mb-1">{r.is_internal ? `${t('internal_note', lang)} · ` : ''}{r.author_name || (r.is_staff ? t('support', lang) : t('guest', lang))} · {when(r.created_at)}</p><p className="whitespace-pre-wrap text-gray-800">{r.message}</p></li>)}</ul>
                <div className="space-y-2"><Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t(internal ? 'internal_note_placeholder' : 'reply_placeholder', lang)} /><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={internal} onChange={(e) => setInternal(e.target.checked)} />{t('internal_note_only', lang)}</label><div className="flex items-center justify-between gap-3"><p className="text-xs text-gray-400">{!internal && t('reply_email_notice', lang)}</p><Button loading={busy} disabled={!reply.trim()} onClick={send}>{t(internal ? 'save_note' : 'send_reply', lang)}</Button></div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
