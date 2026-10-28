// FILE PATH: frontend/src/pages/ai/BizTrackAI.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { aiService } from '../../services/api';
import { Button, ConfirmModal, Input } from '../../components/ui';
import { t } from '../../utils/i18n';

const PENDING = 'biztrackAiPendingQuestion';

function plain(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*•-]\s+/gm, '');
}

function Bubble({ item, lang, onAction }) {
  const user = item.role === 'user';
  const sources = item.sources || item.metadata?.sources || [];
  const actions = item.actions || item.metadata?.actions || [];
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-6 text-left ${user ? 'gradient-primary text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
        <p className="whitespace-pre-wrap">{plain(item.text)}</p>
        {!user && (sources.length > 0 || actions.length > 0 || item.source === 'fallback' || item.toolsDenied?.length > 0) && (
          <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
            {sources.length > 0 && <p className="text-[11px] text-gray-500">{t('ai_sources', lang)}: {sources.map((source, index) => <span key={`${source.to}-${source.label}`}>{index > 0 ? ', ' : ''}<Link className="text-primary hover:underline" to={source.to}>{source.label}</Link></span>)}</p>}
            {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" onClick={() => onAction(action)} className="px-2.5 py-1 text-xs font-medium rounded border border-primary text-primary hover:bg-primary-10">{action.label}</button>)}</div>}
            {item.source === 'fallback' && <p className="text-[11px] text-amber-600">{t('ai_provider_offline', lang)}</p>}
            {item.toolsDenied?.length > 0 && <p className="text-[11px] text-amber-600">{t('ai_access_limited', lang)}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Ask BizTrack about the business in plain words. Answers come from verified data fetched by tools the person is allowed to use. */
export default function BizTrackAI() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { showError, showSuccess } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [caps, setCaps] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [side, setSide] = useState(false);
  const bottom = useRef(null);

  const loadList = useCallback(async () => { try { setList(await aiService.conversations()); } catch (err) { showError(err.message || t('ai_chat_failed', lang)); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (id) => { setActiveId(id); setSide(false); try { setMessages((await aiService.conversation(id))?.messages || []); } catch (err) { showError(err.message); } };
  const send = useCallback(async (q) => {
    const clean = String(q ?? '').trim(); if (!clean || sending) return;
    setMessages((m) => [...m, { role: 'user', text: clean }, { role: 'assistant', text: '', provisional: true, sources: [], actions: [] }]);
    setText(''); setSending(true);
    const patch = (fn) => setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      if (!last || last.role !== 'assistant') return m;
      next[next.length - 1] = fn(last);
      return next;
    });
    const apply = (r) => { if (r?.conversationId) setActiveId(r.conversationId); patch((last) => ({ ...last, text: r.answer || last.text, sources: r.sources || last.sources, actions: r.actions || last.actions, source: r.source, toolsDenied: r.toolsDenied, provisional: false })); };
    try {
      const done = await aiService.askStream({
        message: clean,
        conversationId: activeId,
        onEvent: (event) => {
          if (event.type === 'figures') patch((last) => ({ ...last, text: event.answer || last.text, sources: event.sources || [], actions: event.actions || [], provisional: true }));
          if (event.type === 'delta') patch((last) => ({ ...last, text: last.provisional ? event.text : `${last.text || ''}${event.text}`, provisional: false }));
        },
      });
      if (done) apply(done);
      loadList();
    } catch (err) {
      try { apply(await aiService.ask({ message: clean, conversationId: activeId })); loadList(); }
      catch (again) { patch((last) => ({ ...last, text: again.message || err.message || t('ai_chat_failed', lang), provisional: false })); }
    } finally { setSending(false); }
  }, [activeId, sending, loadList, lang]);
  const openAction = (action) => {
    if (action.draft?.kind === 'purchase') sessionStorage.setItem('biztrackAiPurchaseDraft', JSON.stringify(action.draft));
    if (action.draft?.kind === 'sms') sessionStorage.setItem('biztrackAiSmsDraft', JSON.stringify(action.draft));
    navigate(action.to);
  };

  useEffect(() => { loadList(); aiService.capabilities().then(setCaps).catch(() => {}); }, [loadList]);
  // a question carried over from "Explain this report" / the Dashboard
  useEffect(() => { const q = localStorage.getItem(PENDING); if (q) { localStorage.removeItem(PENDING); send(q); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const remove = async () => { try { await aiService.deleteConversation(confirm.id); showSuccess(t('conversation_deleted', lang)); if (activeId === confirm.id) { setActiveId(null); setMessages([]); } loadList(); } catch (err) { showError(err.message); } setConfirm(null); };
  const suggestions = [t('ai_question_profit', lang), t('ai_question_sales', lang), t('ai_question_products', lang)];
  const tools = caps?.tools || [];

  if (!can('ai_access')) return <MainLayout><div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('no_permission', lang)}</div></MainLayout>;
  return (
    <MainLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <aside className={`lg:col-span-1 ${side ? '' : 'hidden lg:block'} space-y-3`}>
          <Button className="w-full" onClick={() => { setActiveId(null); setMessages([]); setSide(false); }}>{t('new_conversation', lang)}</Button>
          <ul className="bg-white rounded shadow divide-y divide-gray-100 max-h-[55vh] overflow-auto">
            {list.length === 0 && <li className="p-4 text-center text-xs text-gray-400">{t('ui_nothing_yet', lang)}</li>}
            {list.map((c) => <li key={c.id} className={`flex items-start gap-2 px-3 py-2 ${activeId === c.id ? 'bg-primary-10' : ''}`}><button type="button" className="flex-1 text-left min-w-0" onClick={() => open(c.id)}><p className="text-sm font-medium text-gray-800 truncate">{c.title}</p><p className="text-[11px] text-gray-400 truncate">{new Date(c.updatedAt).toLocaleDateString()} · {c.preview}</p></button><button type="button" className="text-gray-300 hover:text-red-600 text-sm" onClick={() => setConfirm({ id: c.id, name: c.title })} aria-label={t('delete', lang)}>✕</button></li>)}
          </ul>
          {tools.length > 0 && <div className="bg-white rounded shadow p-3 text-left"><p className="text-xs font-semibold text-gray-700 mb-1">{t('ai_i_can_help_with', lang)}</p><ul className="text-[11px] text-gray-500 space-y-0.5">{tools.map((x) => <li key={x.id}>• {x.name}</li>)}</ul></div>}
        </aside>
        <section className="lg:col-span-3 bg-white rounded shadow flex flex-col min-h-[70vh]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"><div className="text-left"><h1 className="text-base font-bold text-gray-900">BizTrack AI</h1><p className="text-xs text-gray-500">{t('ai_page_desc', lang)}</p></div><button type="button" className="lg:hidden text-sm text-primary" onClick={() => setSide((s) => !s)}>{t('conversations', lang)}</button></div>
          <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 && <div className="text-center py-10 space-y-3"><p className="text-sm text-gray-500">{t('ai_empty_prompt', lang)}</p><div className="flex flex-wrap justify-center gap-2">{suggestions.map((q) => <button key={q} type="button" onClick={() => send(q)} className="px-3 py-1.5 text-sm rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100">{q}</button>)}</div></div>}
            {messages.map((m, i) => <Bubble key={i} item={m} lang={lang} onAction={openAction} />)}
            {sending && <div className="text-xs text-gray-400 text-left">{t('ai_thinking', lang)}…</div>}
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="p-3 border-t border-gray-100 flex items-end gap-2"><Input className="flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('ai_input_placeholder', lang)} /><Button type="submit" loading={sending} disabled={!text.trim()}>{t('send', lang)}</Button></form>
        </section>
      </div>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
