import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useLanguage } from '../contexts/LanguageContext';
import { aiService } from '../services/api';
import { Button, Select } from './ui';
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
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="presentation">
      <div className="bg-white rounded shadow-lg w-full max-w-lg text-left space-y-4 p-5" role="dialog" aria-modal="true" aria-labelledby="daily-brief-title">
        <div>
          <h2 id="daily-brief-title" className="text-base font-semibold text-gray-900">{t('ai_daily_brief', lang)}</h2>
          <p className="text-sm text-gray-700 leading-6 whitespace-pre-wrap mt-2">{brief.text}</p>
        </div>
        {brief.action?.label && <Button type="button" onClick={openStep}>{brief.action.label}</Button>}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Select className="mr-auto w-44" value={wait} onChange={(e) => setWait(e.target.value)} aria-label={t('ai_brief_extend', lang)} options={CHOICES.map(([value, key]) => ({ value, label: t(key, lang) }))} />
          <Button type="button" variant="secondary" onClick={snooze}>{t('ai_brief_extend', lang)}</Button>
          <Button type="button" variant="secondary" onClick={cancel}>{t('ai_brief_cancel', lang)}</Button>
        </div>
      </div>
    </div>
  );
}
