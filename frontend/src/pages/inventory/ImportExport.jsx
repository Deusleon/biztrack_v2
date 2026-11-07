// FILE PATH: frontend/src/pages/inventory/ImportExport.jsx
import { useState, useRef } from 'react';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { importExportService } from '../../services/api';
import { Button } from '../../components/ui';
import FormModal from '../../components/ui/FormModal';
import { t } from '../../utils/i18n';

// Which permissions open each import (the SAME lists the server checks, plus the import_* names the catalog actually has).
const TYPES = [
  { key: 'full', label: 'import_full', can: ['import_products', 'import_stock', 'view_products', 'manage_inventory'] },
  { key: 'products', label: 'import_products_only', can: ['import_products', 'manage_products', 'edit_products'] },
  { key: 'stock', label: 'import_stock_only', can: ['import_stock', 'manage_inventory', 'manage_stock'] },
  { key: 'prices', label: 'import_prices_only', can: ['import_prices', 'manage_products', 'manage_prices'] },
];
const EXPORTS = [['full', 'export_full'], ['products', 'export_products_only'], ['stock', 'export_stock_only'], ['prices', 'export_prices_only']];
const MAX_MB = 10;

const saveBlob = (blob, name) => { const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob])); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

export default function ImportExport() {
  const { can, canAny } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const { lang } = useLanguage();
  const allowed = TYPES.filter((x) => canAny(x.can));
  const [type, setType] = useState(allowed[0]?.key || 'full');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);       // server's { results, message } when some rows have errors
  const [result, setResult] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const input = useRef(null);
  const today = new Date().toISOString().slice(0, 10);

  const pick = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { showError(t('only_excel_csv_allowed', lang)); return; }
    if (f.size > MAX_MB * 1024 * 1024) { showError(t('file_too_large', lang)); return; }
    setFile(f); setResult(null);
  };
  const template = async () => { try { setBusy('template'); saveBlob(await importExportService.template(type), `${type}-template.xlsx`); showSuccess(t('template_downloaded', lang)); } catch (err) { showError(err.message); } finally { setBusy(null); } };
  const exportData = async (k) => { try { setBusy(`export-${k}`); saveBlob(await importExportService.exportData(k), `${k}-export-${today}.xlsx`); showSuccess(t('export_success_xlsx', lang)); } catch (err) { showError(err.message); } finally { setBusy(null); } };

  const finish = (res) => {
    const r = res.results || {}; setResult(r); setShowErrors((r.errors || []).length > 0 && !(r.success > 0));
    if (r.failed > 0 && r.success > 0) showWarning(t('import_partial_success_check_results_for_details', lang));
    else if (r.failed > 0) showError(t('import_failed_check_errors_for_details', lang));
    else showSuccess(t('imported_successfully', lang));
    setFile(null);
  };
  const run = async (confirmed) => {
    if (!file) { showError(t('select_file_first', lang)); return; }
    try {
      setBusy('import');
      const res = await importExportService.importFile(type, file, { confirmed });
      if (res.requiresConfirmation && !confirmed) { setConfirm(res); return; }
      setConfirm(null); finish(res);
    } catch (err) { showError(err.message || t('import_failed', lang)); } finally { setBusy(null); }
  };

  const canExport = can('view_imports_exports') || canAny(['export_products', 'export_stock', 'export_prices']);
  const errs = (r) => (r?.errors || []).slice(0, 200);

  return (
    <MainLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="page-header text-left"><h1 className="text-xl font-bold text-gray-900">{t('import_export', lang)}</h1><p className="text-sm text-gray-500 mt-0.5">{t('import_export_desc', lang)}</p></div>

        <div className="bg-white p-5 rounded shadow space-y-4 text-left">
          <h2 className="text-base font-semibold text-gray-900">{t('import', lang)}</h2>
          {allowed.length === 0 ? <p className="text-sm text-gray-500">{t('no_import_permission', lang)}</p> : (<>
            <div className="flex flex-wrap gap-2">{allowed.map((x) => <button key={x.key} type="button" onClick={() => { setType(x.key); setFile(null); setResult(null); }} className={`px-4 py-2 text-sm rounded border ${type === x.key ? 'border-primary bg-primary-10 text-primary font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{t(x.label, lang)}</button>)}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded p-4 space-y-2"><p className="text-sm font-medium text-gray-800">1. {t('download_template', lang)}</p><p className="text-xs text-gray-500">{t('download_template_hint', lang)}</p><Button variant="secondary" loading={busy === 'template'} onClick={template}>{t('download_xlsx', lang)}</Button></div>
              <div className="border border-gray-200 rounded p-4 space-y-2"><p className="text-sm font-medium text-gray-800">2. {t('upload_file', lang)}</p><p className="text-xs text-gray-500">{t('accept_excel_csv', lang)} (max {MAX_MB} MB)</p>
                <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pick} />
                <div className="flex items-center gap-3 flex-wrap"><Button variant="secondary" onClick={() => input.current?.click()}>{file ? t('choose_file', lang) : t('click_to_upload', lang)}</Button>{file && <span className="text-sm text-gray-700 truncate max-w-[14rem]">{file.name}</span>}</div>
                <Button loading={busy === 'import'} disabled={!file} onClick={() => run(false)}>{busy === 'import' ? t('importing', lang) : t('import', lang)}</Button></div>
            </div>
            <ul className="text-xs text-gray-500 list-disc pl-5 space-y-1"><li>{t('indicate_required_field', lang)}</li>{type === 'full' && <li>{t('tip_full_upsert', lang)}</li>}</ul>
          </>)}
          {result && (
            <div className="border border-gray-200 rounded p-4 space-y-2"><p className="text-sm font-semibold text-gray-800">{t('import_complete', lang)}</p>
              <p className="text-sm"><span className="text-green-700 font-medium">{t('successful', lang)}: {result.success ?? 0}</span> · <span className={result.failed ? 'text-red-600 font-medium' : 'text-gray-500'}>{t('failed', lang)}: {result.failed ?? 0}</span></p>
              {errs(result).length > 0 && <><button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowErrors((s) => !s)}>{showErrors ? t('hide_errors', lang) : t('show_errors', lang)}</button>
                {showErrors && <ul className="text-xs text-red-700 max-h-56 overflow-auto divide-y divide-gray-100">{errs(result).map((e, i) => <li key={i} className="py-1">{t('row', lang)} {e.row}: {t(e.errorKey, lang) === e.errorKey ? e.error : t(e.errorKey, lang)}</li>)}</ul>}</>}
            </div>
          )}
        </div>

        {canExport && (
          <div className="bg-white p-5 rounded shadow space-y-3 text-left"><h2 className="text-base font-semibold text-gray-900">{t('export_data', lang)}</h2><p className="text-xs text-gray-500">{t('export_hint', lang)}</p>
            <div className="flex flex-wrap gap-2">{EXPORTS.map(([k, label]) => <Button key={k} variant="secondary" loading={busy === `export-${k}`} onClick={() => exportData(k)}>{t(label, lang)}</Button>)}</div></div>
        )}
      </div>

      <FormModal isOpen={!!confirm} onClose={() => setConfirm(null)} size="lg" title={t('import_has_errors_title', lang)}>
        {confirm && (<div className="space-y-4 text-left">
          <p className="text-sm text-gray-600">{t('import_confirmation_message', lang)}</p>
          <p className="text-sm"><span className="text-green-700 font-medium">{t('successful', lang)}: {confirm.results?.success ?? 0}</span> · <span className="text-red-600 font-medium">{t('failed', lang)}: {confirm.results?.failed ?? 0}</span></p>
          <ul className="text-xs text-red-700 max-h-56 overflow-auto divide-y divide-gray-100 border border-gray-100 rounded px-3">{errs(confirm.results).map((e, i) => <li key={i} className="py-1">{t('row', lang)} {e.row}: {t(e.errorKey, lang) === e.errorKey ? e.error : t(e.errorKey, lang)}</li>)}</ul>
          <div className="flex justify-end gap-3"><Button loading={busy === 'import'} disabled={!(confirm.results?.success > 0)} onClick={() => run(true)}>{t('import_valid_only', lang)}</Button><Button variant="secondary" onClick={() => { setConfirm(null); setFile(null); }}>{t('cancel_import', lang)}</Button></div>
        </div>)}
      </FormModal>
    </MainLayout>
  );
}
