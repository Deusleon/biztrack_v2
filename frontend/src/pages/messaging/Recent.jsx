// FILE PATH: frontend/src/pages/messaging/Recent.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import SendMessageModal from './SendMessageModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStore } from '../../contexts/StoreContext';
import { messagingService } from '../../services/api';
import { DataTable, Button, Input, Select, RowActions, ACTION_ICONS } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { PStatus } from '../purchases/common';
import { dateTime } from './common';
import { t } from '../../utils/i18n';

const PAGE = 25;
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
  const [page, setPage] = useState(1);
  const [send, setSend] = useState(false);
  const [detail, setDetail] = useState(null);
  const load = useCallback(async () => { try { setLoading(true); setRows(await messagingService.history()); } catch (err) { showError(err.message); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); if (can('manage_messaging')) messagingService.groups().then(setGroups).catch(() => {}); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => { const q = search.trim().toLowerCase(); return rows.filter((r) => (!status || r.status === status) && (!q || `${r.message} ${r.group_name || ''} ${r.recipient || ''} ${r.recipient_name || ''} ${r.sent_by || ''}`.toLowerCase().includes(q))); }, [rows, search, status]);
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
        <div className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('ui_search_placeholder', lang)} /><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: '', label: t('all', lang) }, ...['sent', 'partial', 'failed'].map((x) => ({ value: x, label: t(x === 'partial' ? 'partially_sent' : x, lang) }))]} /></div>
        <DataTable columns={columns} data={shown.slice((cur - 1) * PAGE, cur * PAGE)} loading={loading} rowId="batch_id" emptyMessage={search || status ? t('ui_nothing_matches', lang) : t('ui_nothing_yet', lang)} pagination={{ currentPage: cur, totalPages: pages, totalItems: shown.length, limit: PAGE }} onPageChange={setPage} renderActions={(r) => <RowActions actions={[{ label: t('view', lang), icon: ACTION_ICONS.view, onClick: () => open(r) }]} />} />
      </div>
      <SendMessageModal isOpen={send} onClose={() => setSend(false)} groups={groups} onSent={load} />
      <FormModal isOpen={!!detail} onClose={() => setDetail(null)} size="md" title={t('message_details', lang)}>
        {detail && <div className="space-y-3 text-left text-sm"><p className="text-gray-500">{dateTime(detail.created_at)} · {detail.sent_by || '—'}{detail.group_name ? ` · ${t('group', lang)}: ${detail.group_name}` : ''}</p><p className="bg-gray-50 border border-gray-100 rounded p-3 whitespace-pre-wrap">{detail.message}</p>
          <p className="text-gray-600">{t('sent', lang)}: <b className="text-green-700">{detail.recipients.filter((r) => r.status === 'sent').length}</b> · {t('failed', lang)}: <b className="text-red-600">{detail.recipients.filter((r) => r.status === 'failed').length}</b></p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded max-h-64 overflow-auto">{detail.recipients.map((r) => <li key={r.id} className="px-3 py-1.5 flex justify-between gap-3"><span>{r.recipient_name ? `${r.recipient_name} · ` : ''}{r.recipient}</span><span className={r.status === 'sent' ? 'text-green-700' : 'text-red-600'} title={r.error || ''}>{r.status}</span></li>)}</ul><div className="flex justify-end"><Button variant="secondary" onClick={() => setDetail(null)}>{t('close', lang)}</Button></div></div>}
      </FormModal>
    </MainLayout>
  );
}
