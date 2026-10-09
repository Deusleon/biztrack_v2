// FILE PATH: frontend/src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from './ui';
import { t } from '../utils/i18n';
import { useLanguage } from '../contexts/LanguageContext';

/** Opens the camera. Some phones only expose the older getUserMedia, and insecure pages have neither. */
function requestCamera(constraints) {
  const devices = navigator.mediaDevices;
  if (devices?.getUserMedia) return devices.getUserMedia(constraints);
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  if (!legacy) return null;
  return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

/**
 * Reads a barcode with the phone camera. Calls onScan(text) once with the first code it recognises.
 * The dialog always opens; if the camera cannot start, the reason is shown inside it.
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const { lang } = useLanguage();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    let stream;

    const fail = (err) => {
      if (cancelled) return;
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setError(denied ? t('camera_access_denied', lang) : t('camera_not_available', lang));
    };

    (async () => {
      if (!video) { fail(); return; }
      try {
        const next = requestCamera({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!next) { fail(); return; }
        stream = await next;
        if (cancelled) { stopStream(stream); return; }
        controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
          if (result && !doneRef.current) { doneRef.current = true; onScan(result.getText()); }
        });
      } catch (err) {
        stopStream(stream);
        fail(err);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop?.();
      stopStream(stream);
      if (video) video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('scan_barcode', lang)}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('ui_cancel', lang)}>✕</button>
        </div>
        <div className="bg-black aspect-video relative">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          {!error && <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 pointer-events-none" />}
          {error && <div className="absolute inset-0 bg-white flex items-center justify-center p-6 text-sm text-center text-red-600">{error}</div>}
        </div>
        <div className="p-4 flex justify-end"><Button variant="secondary" onClick={onClose}>{t('ui_cancel', lang)}</Button></div>
      </div>
    </div>,
    document.body,
  );
}
