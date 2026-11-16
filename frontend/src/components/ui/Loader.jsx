// FILE PATH: frontend/src/components/ui/Loader.jsx
// The one loading state for every page, table, and popup. The caption follows the language the person selected.
import { useLanguage } from '../../contexts/LanguageContext';
import { t } from '../../utils/i18n';

export default function Loader({ full = false, className = '' }) {
  const { lang } = useLanguage();
  const box = full
    ? 'min-h-screen flex flex-col items-center justify-center bg-gray-100'
    : 'bg-white p-8 rounded shadow text-center';
  return (
    <div className={`${box} ${className}`.trim()} role="status" aria-live="polite">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-gray-500 mt-2">{t('loading_data', lang)}</p>
    </div>
  );
}
