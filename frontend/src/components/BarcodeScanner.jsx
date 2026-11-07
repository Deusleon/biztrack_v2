// FILE PATH: frontend/src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from './ui';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Reads a barcode / QR code with the device camera (phone, tablet or laptop). Calls onScan(text) once with the first
 * code it recognises. Works in the installed app too; the browser asks for camera permission the first time.
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const { lang } = useLanguage();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    (async () => {
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result && !doneRef.current) { doneRef.current = true; onScan(result.getText()); }
          },
        );
        if (cancelled) controlsRef.current?.stop();
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? t('camera_access_denied', lang) : (err?.message || t('camera_not_available', lang)));
      }
    })();
    return () => { cancelled = true; controlsRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('scan_barcode', lang)}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <div className="bg-black aspect-video relative">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 pointer-events-none" />
        </div>
        {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
        <div className="p-4 flex justify-end"><Button variant="secondary" onClick={onClose}>{t('ui_cancel', lang)}</Button></div>
      </div>
    </div>
  );
}
