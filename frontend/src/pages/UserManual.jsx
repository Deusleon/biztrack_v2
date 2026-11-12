// FILE PATH: frontend/src/pages/UserManual.jsx
import MainLayout from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';

const UPDATES = ['returns', 'purchases', 'modals', 'messaging', 'daily_summary', 'appearance', 'subscription', 'activity', 'help', 'stock', 'lock'];

const MANUALS = {
  en: { titleKey: 'manual_title_en', languageKey: 'manual_english', pdf: '/manuals/BizTrack_User_Manual.pdf' },
  sw: { titleKey: 'manual_title_sw', languageKey: 'manual_swahili', pdf: '/manuals/BizTrack_Muongozo_wa_Mtumiaji.pdf' },
};

function ManualCard({ code, highlighted, lang }) {
  const m = MANUALS[code];
  return (
    <div className={`rounded border p-5 space-y-4 text-left ${highlighted ? 'border-primary bg-primary-10' : 'border-gray-200 bg-white'}`}>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{t(highlighted ? 'manual_in_your_language' : 'manual_other_language', lang)}</p><h3 className="text-base font-semibold text-gray-900">{t(m.titleKey, lang)}</h3><p className="text-xs text-gray-500 mt-0.5">{t(m.languageKey, lang)} · {t('manual_edition', lang)}</p></div>
      <div className="flex flex-col sm:flex-row gap-2">
        <a href={m.pdf} download className="inline-flex items-center justify-center rounded gradient-primary text-white text-sm font-medium px-4 py-2.5 hover:opacity-90">{t('download_pdf', lang)}</a>
        <a href={m.pdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded border border-primary text-primary text-sm font-medium px-4 py-2.5 hover:bg-primary-10">{t('open_in_browser', lang)}</a>
      </div>
    </div>
  );
}

/** Every signed-in person can read or download the manual — the one in their own language first. */
export default function UserManual() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const mine = String(user?.preferred_language || lang || 'en').toLowerCase().startsWith('sw') ? 'sw' : 'en';
  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('user_manual', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('user_manual_description', lang)}</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ManualCard code={mine} highlighted lang={lang} />
          <ManualCard code={mine === 'sw' ? 'en' : 'sw'} lang={lang} />
        </div>
        <section className="bg-white rounded shadow p-5 text-left space-y-4">
          <div><h2 className="text-base font-semibold text-gray-900">{t('manual_whats_new', lang)}</h2><p className="text-sm text-gray-500 mt-1">{t('manual_whats_new_intro', lang)}</p></div>
          {UPDATES.map((key) => (
            <article key={key} className="border-t border-gray-100 pt-3">
              <h3 className="text-sm font-semibold text-gray-800">{t(`manual_${key}_title`, lang)}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{t(`manual_${key}_body`, lang)}</p>
            </article>
          ))}
        </section>
        <p className="text-xs text-gray-400 text-left">{t('manual_formats_hint', lang)}</p>
      </div>
    </MainLayout>
  );
}
