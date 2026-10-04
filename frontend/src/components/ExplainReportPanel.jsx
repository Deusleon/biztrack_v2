// FILE PATH: frontend/src/components/ExplainReportPanel.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { aiService } from '../services/api';
import { t } from '../utils/i18n';

/** "Explain" button for a report: the AI explains the VERIFIED figures of the report on screen (sales, profit or inventory), in a side panel. */
export default function ExplainReportPanel({ reportType, reportKey, filters }) {
  const navigate = useNavigate();
  const { showError } = useToast();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const explain = async () => { setOpen(true); setLoading(true); try { setResult(await aiService.explainReport({ reportType, reportKey, filters })); } catch (err) { showError(err.message || t('ai_explain_failed', lang)); setOpen(false); } finally { setLoading(false); } };
  const carry = () => { localStorage.setItem('biztrackAiPendingQuestion', `${t('ai_continue_question', lang)} ${reportType} / ${reportKey} (${JSON.stringify(filters || {})}).${result?.explanation ? ` ${result.explanation.slice(0, 600)}` : ''}`); navigate('/biztrack-ai'); };
  return (
    <>
      <Button type="button" variant="secondary" onClick={explain}>{t('ai_explain', lang)}</Button>
      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button type="button" aria-label={t('close', lang)} className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-full sm:max-w-lg bg-white border-l border-gray-200 shadow-2xl flex flex-col text-left">
            <header className="p-4 border-b border-gray-100 flex items-center justify-between"><div><h3 className="font-semibold text-gray-900">{t('ai_report_explanation', lang)}</h3><p className="text-xs text-gray-500">{reportType} / {reportKey}</p></div><button type="button" onClick={() => setOpen(false)} className="p-2 rounded hover:bg-gray-100" aria-label={t('close', lang)}>✕</button></header>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loading && <p className="text-sm text-gray-500">{t('ai_thinking', lang)}…</p>}
              {result && !loading && <><p className="text-xs text-emerald-700">✓ {t('ai_verified_data', lang)}</p><p className="whitespace-pre-wrap text-sm leading-7 text-gray-800">{result.explanation}</p>
                <div className="rounded border border-gray-200 p-3 text-xs text-gray-500 space-y-1"><p>{t('ai_provider', lang)}: {result.provider}{result.source === 'fallback' ? ` (${t('ai_provider_offline', lang)})` : result.model ? ` · ${result.model}` : ''}</p><p>{t('ai_generated', lang)}: {new Date(result.generatedAt).toLocaleString()}</p></div></>}
            </div>
            <footer className="p-4 border-t border-gray-100 flex gap-2 justify-end"><Button type="button" variant="secondary" onClick={explain} disabled={loading}>{t('refresh', lang)}</Button><Button type="button" onClick={carry} disabled={!result || loading}>{t('ai_continue_in_biztrack', lang)}</Button></footer>
          </aside>
        </div>
      )}
    </>
  );
}
