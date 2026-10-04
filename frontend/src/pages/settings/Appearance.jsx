// FILE PATH: frontend/src/pages/settings/Appearance.jsx
import { useState } from 'react';
import MainLayout from '../../components/MainLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui';
import { t } from '../../utils/i18n';

const luminance = (hex) => { const n = parseInt(hex.replace('#', ''), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const shade = (hex, f) => { const n = parseInt(hex.replace('#', ''), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0'); return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`; };

/** The colours of this device's app (kept in the browser, not on the server): ready-made themes or your own. */
export default function Appearance() {
  const { theme, presetThemes, setPresetTheme, setCustomTheme } = useTheme();
  const { lang } = useLanguage();
  const [filter, setFilter] = useState('all');
  const [custom, setCustom] = useState({ primary: theme.primary, accent: theme.accent });
  const entries = Object.entries(presetThemes).filter(([, p]) => filter === 'all' || (filter === 'light') === (luminance(p.primary) > 0.5));
  const applyCustom = () => setCustomTheme(t('custom_theme', lang), { primary: custom.primary, primaryDark: shade(custom.primary, 0.75), primaryLight: shade(custom.primary, 1.25), accent: custom.accent });

  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('appearance', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('appearance_desc', lang)}</p></div>
        <div className="flex gap-2">{[['all', 'all_themes'], ['light', 'light_themes'], ['dark', 'dark_themes']].map(([k, label]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`px-3 py-1.5 text-sm rounded border ${filter === k ? 'border-primary bg-primary-10 text-primary font-medium' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>{t(label, lang)}</button>)}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {entries.map(([key, p]) => { const active = theme.primary === p.primary && theme.accent === p.accent; return (
            <button key={key} type="button" onClick={() => setPresetTheme(key)} className={`text-left bg-white rounded shadow p-3 border-2 ${active ? 'border-primary' : 'border-transparent hover:border-gray-200'}`}>
              <div className="h-12 rounded mb-2 flex overflow-hidden"><span className="flex-1" style={{ background: p.primaryDark }} /><span className="flex-1" style={{ background: p.primary }} /><span className="flex-1" style={{ background: p.primaryLight }} /><span className="w-6" style={{ background: p.accent }} /></div>
              <p className="text-sm font-medium text-gray-800">{p.name}{active && <span className="ml-1 text-primary">✓</span>}</p></button>); })}
        </div>
        <div className="bg-white rounded shadow p-5 text-left space-y-3"><h2 className="text-sm font-semibold text-gray-800">{t('custom_theme', lang)}</h2>
          <div className="flex flex-wrap items-end gap-4">{[['primary', 'primary_color'], ['accent', 'accent_color']].map(([k, label]) => <label key={k} className="text-sm text-gray-700"><span className="block mb-1">{t(label, lang)}</span><input type="color" value={custom[k]} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))} className="h-10 w-20 rounded border border-gray-300 cursor-pointer" /></label>)}<Button onClick={applyCustom}>{t('apply', lang)}</Button><Button variant="secondary" onClick={() => setPresetTheme('navy')}>{t('reset_to_default', lang)}</Button></div>
          <p className="text-xs text-gray-500">{t('theme_note', lang)}</p></div>
      </div>
    </MainLayout>
  );
}
