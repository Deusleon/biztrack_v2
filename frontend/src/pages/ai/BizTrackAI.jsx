// FILE PATH: frontend/src/pages/ai/BizTrackAI.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { aiService } from '../../services/api';
import { Button, ConfirmModal } from '../../components/ui';
import { t } from '../../utils/i18n';

const PENDING = 'biztrackAiPendingQuestion';
const strategy = (s, lang) => (s === 'native_function_calling' ? t('ai_native_tool_selection', lang) : s === 'controlled_routing' ? t('ai_controlled_tool_selection', lang) : null);

function Bubble({ item, lang }) {
  const user = item.role === 'user'; const label = strategy(item.toolSelectionStrategy, lang);
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-6 text-left ${user ? 'gradient-primary text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
        <p className="whitespace-pre-wrap">{item.text}</p>
        {!user && (item.toolsUsed?.length > 0 || item.source === 'fallback') && (
          <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
            {item.toolsUsed?.length > 0 && <span>{t('ai_sources', lang)}: {item.toolsUsed.join(', ')}</span>}
            {label && <span>• {label}</span>}
            {item.source === 'fallback' && <span className="text-amber-600">• {t('ai_provider_offline', lang)}</span>}
            {item.toolsDenied?.length > 0 && <span className="text-amber-600">• {t('ai_access_limited', lang)}</span>}
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
    setMessages((m) => [...m, { role: 'user', text: clean }]); setText(''); setSending(true);
    try { const r = await aiService.ask({ message: clean, conversationId: activeId }); setActiveId(r.conversationId); setMessages((m) => [...m, { role: 'assistant', text: r.answer, toolsUsed: r.toolsUsed || [], toolsDenied: r.toolsDenied || [], toolSelectionStrategy: r.toolSelectionStrategy, source: r.source }]); loadList(); }
    catch (err) { setMessages((m) => [...m, { role: 'assistant', text: err.message || t('ai_chat_failed', lang) }]); }
    finally { setSending(false); }
  }, [activeId, sending, loadList, lang]);

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
            {messages.map((m, i) => <Bubble key={i} item={m} lang={lang} />)}
            {sending && <div className="text-xs text-gray-400 text-left">{t('ai_thinking', lang)}…</div>}
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="p-3 border-t border-gray-100 flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('ai_input_placeholder', lang)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-20" /><Button type="submit" loading={sending} disabled={!text.trim()}>{t('send', lang)}</Button></form>
        </section>
      </div>
      <ConfirmModal isOpen={!!confirm} variant="danger" title={t('delete', lang)} confirmText={t('delete', lang)} cancelText={t('ui_cancel', lang)} message={t('ui_confirm_delete', lang, { name: confirm?.name })} onClose={() => setConfirm(null)} onConfirm={remove} />
    </MainLayout>
  );
}
