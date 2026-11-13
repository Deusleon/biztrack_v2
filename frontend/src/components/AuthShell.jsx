// FILE PATH: frontend/src/components/AuthShell.jsx
import BrandMark from './BrandMark';
import { useLanguage } from '../contexts/LanguageContext';

/** The frame around every sign-in style page: brand on a gradient, the form on a white card, language switch. */
export default function AuthShell({ title, subtitle, children, footer }) {
  const { lang, setLang } = useLanguage();
  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary-dark p-4 safe-top">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-white mb-5">
          <BrandMark className="w-16 h-auto" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight">BizTrack</h1>
        </div>
        <div className="bg-white rounded shadow-xl p-6 sm:p-8">
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-5 text-sm text-center text-gray-600 space-y-1">{footer}</div>}
        </div>
        <div className="flex justify-center gap-2 mt-4 text-xs text-white">
          {['sw', 'en'].map((code) => (
            <button key={code} type="button" onClick={() => setLang(code)} className={`px-3 py-1 rounded border ${lang === code ? 'bg-white text-primary-dark font-semibold' : 'border-white/50 hover:bg-white/10'}`}>
              {code === 'sw' ? 'Kiswahili' : 'English'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
