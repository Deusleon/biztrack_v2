// FILE PATH: frontend/src/components/ImageInput.jsx
import { useRef, useState, useEffect } from 'react';
import { Button } from './ui';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';

/**
 * Picture picker with a preview. `value` is either a URL (the picture already saved) or { file, preview } (a new pick);
 * the page uploads the file when the form is saved (see utils/cloudinary.js). Phones offer camera or gallery.
 */
export default function ImageInput({ label, value, onChange, disabled, error, maxMB = 5 }) {
  const { lang } = useLanguage();
  const ref = useRef(null);
  const [problem, setProblem] = useState('');
  const preview = typeof value === 'string' ? value : value?.preview;

  useEffect(() => () => { if (value && typeof value !== 'string' && value.preview) URL.revokeObjectURL(value.preview); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProblem(t('invalid_image_type', lang)); return; }
    if (file.size > maxMB * 1024 * 1024) { setProblem(t('image_too_large', lang, { max: maxMB })); return; }
    setProblem('');
    onChange({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <div>
      {label && <label className="block text-sm text-left font-medium text-gray-700 mb-1">{label}</label>}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded border border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400">{t('no_image', lang)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>{t('choose_file', lang)}</Button>
          {preview && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>{t('remove', lang)}</Button>}
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
      {(problem || error) && <p className="mt-1 text-xs text-left text-red-500">{problem || error}</p>}
    </div>
  );
}
