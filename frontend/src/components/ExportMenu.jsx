// FILE PATH: frontend/src/components/ExportMenu.jsx
import { useState, useRef, useEffect } from 'react';
import { Button } from './ui';
import Icon from './ui/Icon';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useStoreSettings } from '../hooks/useStoreSettings';
import { exportToCSV, exportToXLSX, exportToPDF } from '../utils/exportUtils';
import { t } from '../utils/i18n';

const LABELS = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV', print: 'print', copy: 'copy' };

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One "Export" button for any list: PDF, Excel, CSV, Print, Copy — the SAME export engine BizTrack has always used
 * (utils/exportUtils.js), so the PDF layout, header with the business details, number and currency formats and
 * totals row stay exactly as they were.
 *
 * rows     the rows to export (already display-ready: formatted money, readable dates…)
 * columns  [{ key, title }]   title is a translation key, as everywhere in BizTrack
 * title    translation key of the report title (also names the file)
 */
export default function ExportMenu({ rows, columns, title, formats = ['pdf', 'xlsx', 'csv', 'print', 'copy'], withFooter = false, orientation = 'portrait', columnStyles = {}, fromDate = null, toDate = null, disabled = false, loadRows }) {
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings, loading: settingsLoading } = useStoreSettings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const print = (data) => {
    const w = window.open('', '_blank');
    if (!w) throw new Error('popup blocked');
    const head = columns.map((c) => `<th>${esc(t(c.title, lang))}</th>`).join('');
    const body = data.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t(title, lang))}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:12px;margin:16px}h2{margin:0 0 2px}p{margin:0 0 10px;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#f1f5f9}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>
      <h2>${esc(settings?.businessName || settings?.storeName || 'BizTrack')}</h2><p>${esc(t(title, lang))} — ${new Date().toLocaleString()}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  const run = async (type) => {
    if (busy) return;
    setOpen(false); setBusy(type);
    await new Promise((r) => requestAnimationFrame(r));
    try {
      // A list that is paged on the server hands over a loader that fetches every row for the export.
      const data = loadRows ? await loadRows() : rows;
      if (!data || data.length === 0) { showError(t('no_data', lang)); return; }
      const fileName = `${t(title, lang) || 'export'}-${new Date().toISOString().slice(0, 10)}`;
      let ok = true;
      if (type === 'csv') ok = exportToCSV(data, fileName, columns, t(title, lang), withFooter, fromDate, toDate);
      else if (type === 'xlsx') ok = exportToXLSX(data, fileName, columns, t(title, lang), withFooter, fromDate, toDate);
      else if (type === 'pdf') ok = await exportToPDF(data, fileName, columns, t(title, lang), withFooter, settings, settingsLoading ? null : settings, orientation, columnStyles, fromDate, toDate);
      else if (type === 'copy') await navigator.clipboard.writeText(data.map((r) => columns.map((c) => r[c.key] ?? '').join('\t')).join('\n'));
      else if (type === 'print') print(data);
      if (ok === false) throw new Error('export failed');
      showSuccess(type === 'copy' ? t('copied_to_clipboard', lang) : t('export_success', lang, { fileType: LABELS[type].toUpperCase() }));
    } catch (err) {
      console.error('Export error:', err);
      showError(t('export_failed', lang, { fileType: LABELS[type].toUpperCase() }));
    } finally { setBusy(null); }
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" mobileIcon="download" mobileLabel={t('export', lang)} loading={!!busy} disabled={disabled} onClick={() => setOpen((o) => !o)}>{t('export', lang)}</Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg py-1 z-20" role="menu">
          {formats.map((f) => (
            <button key={f} type="button" onClick={() => run(f)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50" role="menuitem">
              <Icon name={f === 'print' ? 'printer' : f === 'copy' ? 'copy' : 'download'} className="w-4 h-4 text-gray-500" />
              {['pdf', 'xlsx', 'csv'].includes(f) ? LABELS[f] : t(LABELS[f], lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
