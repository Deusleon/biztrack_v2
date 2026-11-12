// FILE PATH: frontend/src/components/DashboardAiCards.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useLanguage } from '../contexts/LanguageContext';
import { aiService } from '../services/api';
import { Button } from './ui';
import { t } from '../utils/i18n';

const SEV = { critical: 'bg-red-50 text-red-700', warning: 'bg-amber-50 text-amber-700', info: 'bg-blue-50 text-blue-700', positive: 'bg-green-50 text-green-700' };

/** Two cards for the Dashboard: today's business summary written by the AI (verified figures), and a box to ask BizTrack AI a question. */
export default function DashboardAiCards() {
  const { can } = useAuth();
  const { currentStore } = useStore();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const load = useCallback(async (refresh) => { try { setLoading(true); setFailed(false); setData(await aiService.businessSummary(refresh)); } catch { setFailed(true); } finally { setLoading(false); } }, [currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- a new `load` on every store switch is what re-runs the effect below
  useEffect(() => { if (can('ai_access')) load(false); }, [load, can]);
  if (!can('ai_access')) return null;
  const ask = (e) => { e.preventDefault(); if (!q.trim()) return; localStorage.setItem('biztrackAiPendingQuestion', q.trim()); navigate('/biztrack-ai'); };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded shadow p-5 text-left space-y-2">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-800">{t('ai_business_summary', lang)}</h2><button type="button" onClick={() => load(true)} disabled={loading} className="text-xs text-primary hover:underline disabled:opacity-50">{t('refresh', lang)}</button></div>
        {loading && !data && <p className="text-sm text-gray-400">{t('ai_thinking', lang)}…</p>}
        {failed && <p className="text-sm text-gray-400">{t('ai_summary_unavailable', lang)}</p>}
        {data && <><p className="text-sm text-gray-700 leading-6">{data.summary}</p>
          {(data.signals || []).length > 0 && <div className="flex flex-wrap gap-1.5">{data.signals.map((s, i) => <span key={i} className={`px-2 py-0.5 rounded text-[11px] font-medium ${SEV[s.severity] || SEV.info}`}>{String(s.type).replace(/_/g, ' ').toLowerCase()}</span>)}</div>}
          <p className="text-[11px] text-gray-400">{data.source === 'fallback' ? t('ai_provider_offline', lang) : `${data.provider}${data.model ? ` · ${data.model}` : ''}`}{data.cached ? ` · ${t('ai_cached', lang)}` : ''}</p></>}
      </div>
      <form onSubmit={ask} className="bg-white rounded shadow p-5 text-left space-y-3"><h2 className="text-sm font-semibold text-gray-800">{t('ai_ask_biztrack', lang)}</h2><textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} placeholder={t('ai_input_placeholder', lang)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-20" /><Button type="submit" disabled={!q.trim()}>{t('ai_ask', lang)}</Button></form>
    </div>
  );
}
