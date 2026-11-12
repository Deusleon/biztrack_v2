// FILE PATH: frontend/src/pages/messaging/Recent.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import SendMessageModal from './SendMessageModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { DataTable, Button, Input, Select, RowActions, ACTION_ICONS, DatePicker } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus } from '../purchases/common';
import { dateTime } from './common';
import { t } from '../../utils/i18n';

const PAGE = 25;
const localDay = (v) => { const d = new Date(v); if (Number.isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export default function Recent() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [send, setSend] = useState(false);
  const [detail, setDetail] = useState(null);
  const load = useCallback(async () => { try { setLoading(true); setRows(await messagingService.history()); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); if (can('manage_messaging')) messagingService.groups().then(setGroups).catch(() => {}); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const day = localDay(r.created_at);
      return (!status || r.status === status) && (!from || day >= from) && (!to || day <= to) && (!q || `${r.message} ${r.group_name || ''} ${r.recipient || ''} ${r.recipient_name || ''} ${r.sent_by || ''}`.toLowerCase().includes(q));
    });
  }, [rows, search, status, from, to]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)); const cur = Math.min(page, pages);
  const open = async (r) => { try { setDetail(await messagingService.batch(r.batch_id)); } catch (err) { showError(err.message); } };
  const columns = [
    { key: 'created_at', label: t('date', lang), render: (r) => dateTime(r.created_at) },
    { key: 'to', label: t('recipients', lang), render: (r) => (r.group_name ? `${t('group', lang)}: ${r.group_name} (${r.recipient_count})` : Number(r.recipient_count) === 1 ? `${r.recipient_name ? `${r.recipient_name} · ` : ''}${r.recipient}` : `${r.recipient_count}`) },
    { key: 'message', label: t('message', lang), render: (r) => <span className="line-clamp-2 text-left">{r.message}</span> },
    { key: 'status', label: t('status', lang), render: (r) => <PStatus value={r.status === 'partial' ? 'partially_sent' : r.status} /> },
    { key: 'sent_by', label: t('sent_by', lang), render: (r) => r.sent_by || '—' },
  ];
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3"><div className="text-left"><h1 className="text-xl font-bold text-gray-900">{t('recently_sent', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('recently_sent_desc', lang)}</p></div>{can('manage_messaging') && <Button onClick={() => setSend(true)} mobileLabel={t('send_message', lang)}>{t('send_message', lang)}</Button>}</div>
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
          <Input className="w-full min-w-0" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('ui_search_placeholder', lang)} />
          <Select className="w-full min-w-0" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: '', label: t('all', lang) }, ...['sent', 'partial', 'failed'].map((x) => ({ value: x, label: t(x === 'partial' ? 'partially_sent' : x, lang) }))]} />
          <DatePicker className="w-full min-w-0" label={t('start_date', lang)} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <DatePicker className="w-full min-w-0" label={t('end_date', lang)} align="right" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <DataTable columns={columns} data={shown.slice((cur - 1) * PAGE, cur * PAGE)} loading={loading} rowId="batch_id" emptyMessage={search || status || from || to ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={{ currentPage: cur, totalPages: pages, totalItems: shown.length, limit: PAGE }} onPageChange={setPage} renderActions={(r) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(r) }]} />} />
      </div>
      <SendMessageModal isOpen={send} onClose={() => setSend(false)} groups={groups} onSent={load} />
      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="xl" title={t('message_details', lang)}>
        {detail && <div className="space-y-5 text-left">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[t('date', lang), dateTime(detail.created_at)], [t('sent_by', lang), detail.sent_by], [t('group', lang), detail.group_name], [t('status', lang), t(detail.status === 'partial' ? 'partially_sent' : detail.status, lang)]].map(([k, v]) => <div key={k} className="rounded-md bg-gray-50 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-400">{k}</p><p className="text-sm font-medium text-gray-900 mt-0.5 break-words">{v || '—'}</p></div>)}
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap">{detail.message}</div>
          <div className="overflow-x-auto border border-gray-200 rounded-md max-h-72"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2.5 text-left font-medium">{t('contacts', lang)}</th><th className="px-3 py-2.5 text-left font-medium">{t('status', lang)}</th></tr></thead>
            <tbody>{detail.recipients.map((r) => <tr key={r.id} className="border-t border-gray-100"><td className="px-3 py-2.5">{r.recipient_name ? `${r.recipient_name} · ` : ''}{r.recipient}</td><td className={`px-3 py-2.5 ${r.status === 'sent' ? 'text-green-700' : 'text-red-600'}`} title={r.error || ''}>{t(r.status, lang)}</td></tr>)}</tbody></table></div>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div>
        </div>}
      </FormModal>
    </MainLayout>
  );
}
