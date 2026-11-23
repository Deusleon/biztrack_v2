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

// Small presentational pieces live at module level so they are not rebuilt on every render.
const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  sun: 'M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v.01M18 14v.01',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5m0 0l9-5m-9 5v8',
  users: 'M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  check: 'M5 13l4 4L19 7',
  close: 'M6 6l12 12M18 6L6 18',
};
const Section = ({ icon, tone, title, count, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
    <header className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tone}`}><Icon d={ICONS[icon]} className="w-4 h-4" /></span>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {count != null && <span className="ml-auto text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">{count}</span>}
    </header>
    {children}
  </section>
);
const Kpi = ({ icon, tone, label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3 min-w-0">
    <span className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl ${tone}`}><Icon d={ICONS[icon]} /></span>
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg sm:text-xl font-bold text-slate-900 leading-tight mt-0.5 break-words">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  </div>
);
const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

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
  const slow = Array.isArray(sections.slow) ? sections.slow.map((n) => (typeof n === 'string' ? n : n?.name)).filter(Boolean) : [];
  const debts = Array.isArray(sections.debts) ? sections.debts : [];
  const owedTotal = debts.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  const profit = Number(sections.profit);
  const hasKpis = sections.sales || sections.profit != null;
  const nothing = !hasKpis && low.length === 0 && slow.length === 0 && debts.length === 0;

  // "2026-11-22" -> "Sunday, 22 November 2026", in the language of the screen.
  const prettyDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(brief.date || '');
    if (!m) return brief.date || '';
    try {
      return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    } catch { return brief.date; }
  })();


  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="bg-slate-50 w-full sm:max-w-xl max-h-[94vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-left" role="dialog" aria-modal="true" aria-labelledby="daily-brief-title">
        <div className="relative px-5 pt-5 pb-6 text-white shrink-0" style={{ background: 'linear-gradient(135deg, var(--color-primary, #1e3a5f) 0%, #0f172a 100%)' }}>
          <button type="button" onClick={cancel} aria-label={t('ai_brief_cancel', lang)} className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"><Icon d={ICONS.close} className="w-4 h-4" /></button>
          <div className="flex items-center gap-3 pr-10">
            <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 ring-1 ring-white/20"><Icon d={ICONS.sun} className="w-6 h-6" /></span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">{t('ai_daily_brief', lang)}</p>
              <h2 id="daily-brief-title" className="text-lg sm:text-xl font-semibold leading-snug truncate">{prettyDate || t('ai_daily_brief', lang)}</h2>
            </div>
          </div>
          {currentStore?.name && <p className="mt-3 text-sm text-white/80 truncate">{currentStore.name}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3.5">
          {hasKpis && (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
              {sections.sales && <Kpi icon="cash" tone="bg-blue-50 text-blue-600" label={t('total_sales', lang)} value={money(sections.sales.net)} hint={`${sections.sales.count} ${t('sales', lang)}`} />}
              {sections.profit != null && <Kpi icon="trend" tone={profit < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'} label={t('profit', lang)} value={money(sections.profit)} />}
            </div>
          )}

          {brief.action?.label && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-700"><Icon d={ICONS.bolt} className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t('ui_brief_do_today', lang)}</p>
                <p className="text-sm text-slate-800 break-words">{brief.action.label}</p>
              </div>
              <Button type="button" className="w-full sm:w-auto" onClick={openStep}>{t('ui_brief_go', lang)}</Button>
            </div>
          )}

          {low.length > 0 && (
            <Section icon="box" tone="bg-amber-50 text-amber-600" title={t('low_stock', lang)} count={low.length}>
              <ul className="divide-y divide-slate-100">
                {low.map((row) => (
                  <li key={row.id || row.name} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-800 min-w-0 break-words">{row.name}</span>
                    <span className="shrink-0 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">{formatQuantity(row.quantity)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {debts.length > 0 && (
            <Section icon="users" tone="bg-rose-50 text-rose-600" title={t('brief_still_owed', lang)} count={debts.length}>
              <ul className="divide-y divide-slate-100">
                {debts.map((row) => (
                  <li key={row.name} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 inline-flex items-center justify-center text-xs font-bold">{initial(row.name)}</span>
                    <span className="text-slate-800 min-w-0 flex-1 break-words">{row.name}</span>
                    <span className="font-semibold text-slate-900 shrink-0">{money(row.balance)}</span>
                  </li>
                ))}
              </ul>
              {debts.length > 1 && (
                <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-slate-50 border-t border-slate-100 text-sm">
                  <span className="text-slate-500">{t('ui_brief_total_owed', lang)}</span>
                  <span className="font-bold text-slate-900">{money(owedTotal)}</span>
                </div>
              )}
            </Section>
          )}

          {slow.length > 0 && (
            <Section icon="clock" tone="bg-slate-100 text-slate-600" title={t('brief_not_selling', lang)} count={slow.length}>
              <div className="px-4 py-3 flex flex-wrap gap-1.5">
                {slow.map((name) => <span key={name} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs">{name}</span>)}
              </div>
            </Section>
          )}

          {nothing && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600"><Icon d={ICONS.check} className="w-5 h-5" /></span>
              <p className="text-sm text-slate-700 leading-6 whitespace-pre-wrap">{brief.text}</p>
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t border-slate-200 bg-white">
          <Select className="w-full sm:w-44 sm:mr-auto" value={wait} onChange={(e) => setWait(e.target.value)} aria-label={t('ai_brief_extend', lang)} options={CHOICES.map(([value, key]) => ({ value, label: t(key, lang) }))} />
          <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={snooze}>{t('ai_brief_extend', lang)}</Button>
          <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={cancel}>{t('ai_brief_cancel', lang)}</Button>
        </div>
      </div>
    </div>
  );
}
