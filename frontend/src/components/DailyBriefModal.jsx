import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useLanguage } from '../contexts/LanguageContext';
import { aiService } from '../services/api';
import { useStoreSettings } from '../hooks/useStoreSettings';
import { Button, Select } from './ui';
import { formatCurrency, formatQuantity } from '../utils/numberUtils';
import { t } from '../utils/i18n';

const CHOICES = [
  ['30', 'ai_brief_30'],
  ['60', 'ai_brief_60'],
  ['180', 'ai_brief_180'],
  ['tomorrow', 'ai_brief_tomorrow'],
];

const storeKey = (userId, storeId) => `biztrackDailyBrief:${userId}:${storeId}`;

const readHold = (userId, storeId) => {
  try { return JSON.parse(localStorage.getItem(storeKey(userId, storeId)) || 'null'); }
  catch { return null; }
};

const heldUntil = (hold) => {
  if (!hold) return 0;
  const until = Date.parse(hold.until || '');
  return Number.isFinite(until) ? until : 0;
};

/** The daily brief opens as a reminder. Close keeps it away until tomorrow. Snooze brings it back after the chosen time. */
export default function DailyBriefModal() {
  const { can, user } = useAuth();
  const { currentStore } = useStore();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const [brief, setBrief] = useState(null);
  const [open, setOpen] = useState(false);
  const [wait, setWait] = useState('60');
  const [tick, setTick] = useState(0);

  const allowed = can('ai_access') && can('view_dashboard');
  const userId = user?.id;
  const storeId = currentStore?.id;

  useEffect(() => {
    if (!allowed || !userId || !storeId) { setOpen(false); return undefined; }
    let gone = false;
    aiService.morningBrief().then((next) => {
      if (gone) return;
      setBrief(next);
      const hold = readHold(userId, storeId);
      setOpen(next?.enabled !== false && next?.text && heldUntil(hold) <= Date.now());
    }).catch(() => { if (!gone) setOpen(false); });
    return () => { gone = true; };
  }, [allowed, userId, storeId, tick]);

  useEffect(() => {
    const wake = () => setTick((n) => n + 1);
    window.addEventListener('focus', wake);
    const onSettings = (event) => {
      if (event.detail?.show_daily_brief === false) setOpen(false);
      else wake();
    };
    window.addEventListener('biztrack-notification-settings-updated', onSettings);
    return () => {
      window.removeEventListener('focus', wake);
      window.removeEventListener('biztrack-notification-settings-updated', onSettings);
    };
  }, []);

  const keep = (until) => {
    localStorage.setItem(storeKey(userId, storeId), JSON.stringify({ until: new Date(until).toISOString() }));
    setOpen(false);
  };
  const cancel = () => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    keep(next.getTime());
  };
  const snooze = () => {
    if (wait === 'tomorrow') { cancel(); return; }
    keep(Date.now() + Number(wait) * 60 * 1000);
  };
  const openStep = () => {
    const action = brief?.action;
    if (!action?.to) return;
    if (action.draft?.kind === 'purchase') sessionStorage.setItem('biztrackAiPurchaseDraft', JSON.stringify(action.draft));
    if (action.draft?.kind === 'sms') sessionStorage.setItem('biztrackAiSmsDraft', JSON.stringify(action.draft));
    setOpen(false);
    navigate(action.to);
  };

  if (!open || !brief?.text) return null;
  const sections = brief.sections || {};
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const low = Array.isArray(sections.lowStock) ? sections.lowStock : [];
  const slow = Array.isArray(sections.slow) ? sections.slow : [];
  const debts = Array.isArray(sections.debts) ? sections.debts : [];
  const stat = (label, value, hint) => (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden text-left" role="dialog" aria-modal="true" aria-labelledby="daily-brief-title">
        <div className="bg-slate-900 text-white px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{t('ai_daily_brief', lang)}</p>
          <h2 id="daily-brief-title" className="text-xl font-semibold mt-1">{brief.date || t('ai_daily_brief', lang)}</h2>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {(sections.sales || sections.profit != null) && (
            <div className="grid grid-cols-2 gap-3">
              {sections.sales && stat(t('total_sales', lang), money(sections.sales.net), `${sections.sales.count} ${t('sales', lang)}`)}
              {sections.profit != null && stat(t('profit', lang), money(sections.profit))}
            </div>
          )}
          {low.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{t('low_stock', lang)}</p>
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                {low.map((row) => (
                  <li key={row.id || row.name} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-800">{row.name}</span>
                    <span className="text-slate-500 shrink-0">{formatQuantity(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {slow.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{t('brief_not_selling', lang)}</p>
              <p className="text-sm text-slate-700">{slow.map((name) => (typeof name === 'string' ? name : name?.name)).filter(Boolean).join(', ')}</p>
            </div>
          )}
          {debts.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">{t('brief_still_owed', lang)}</p>
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                {debts.map((row) => (
                  <li key={row.name} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-800">{row.name}</span>
                    <span className="font-medium text-slate-900 shrink-0">{money(row.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!sections.sales && sections.profit == null && low.length === 0 && slow.length === 0 && debts.length === 0 && (
            <p className="text-sm text-slate-700 leading-6 whitespace-pre-wrap">{brief.text}</p>
          )}
          {brief.action?.label && <Button type="button" className="w-full" onClick={openStep}>{brief.action.label}</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <Select className="mr-auto w-40" value={wait} onChange={(e) => setWait(e.target.value)} aria-label={t('ai_brief_extend', lang)} options={CHOICES.map(([value, key]) => ({ value, label: t(key, lang) }))} />
          <Button type="button" variant="secondary" onClick={snooze}>{t('ai_brief_extend', lang)}</Button>
          <Button type="button" variant="secondary" onClick={cancel}>{t('ai_brief_cancel', lang)}</Button>
        </div>
      </div>
    </div>
  );
}
