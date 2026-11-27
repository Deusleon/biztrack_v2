// FILE PATH: frontend/src/pages/sales/Receipt.jsx
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { Button, Select } from '../../components/ui';
import { buildReceiptData, RECEIPT_SIZE_OPTIONS } from '../../utils/receiptData';
import { printReceiptViaQz } from '../../utils/qzReceipt';
import { t } from '../../utils/i18n';

/** Shows the receipt exactly as it will print (BizTrack's own PDF layout), with size choice, print and download. */
export default function Receipt() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [qzBusy, setQzBusy] = useState(false);
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const saleData = state?.saleData;
  const returnTo = state?.returnTo;
  const [picked, setSize] = useState(null);
  const size = picked || settings?.defaultReceiptSize || '80mm'; // the person's choice wins, otherwise the store's default size


  // The PDF engine is downloaded when a receipt is first shown, not with the rest of the app.
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!saleData || !settings) return undefined;
    let cancelled = false;
    import('../../utils/receiptPdf').then(async ({ generateReceiptPDFUrlAsync }) => {
      if (cancelled) return;
      try {
        const next = await generateReceiptPDFUrlAsync(buildReceiptData({ sale: saleData, settings, cashierName: user?.name }), size);
        if (!cancelled) setUrl(next);
      } catch (e) { console.error('Receipt error:', e); if (!cancelled) setUrl(null); }
    }).catch((e) => { console.error('Receipt error:', e); });
    return () => { cancelled = true; };
  }, [saleData, settings, size, user?.name]);
  useEffect(() => () => { if (url) URL.revokeObjectURL?.(url); }, [url]);

  /** Straight to the printer through QZ Tray — the only print action on this page. */
  const printQz = async () => {
    if (qzBusy || !saleData || !settings) return;
    setQzBusy(true);
    try { await printReceiptViaQz({ saleData, settings, cashierName: user?.name, size }); showSuccess('receipt_printed_successfully'); }
    catch (err) { showError(err.message || t('print_failed', lang)); }
    finally { setQzBusy(false); }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('receipt', lang)}</h1>
            {saleData?.invoice_number && <p className="text-sm text-gray-500 mt-0.5">#{saleData.invoice_number}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              size=""
              value={size}
              onChange={(e) => setSize(e.target.value)}
              options={RECEIPT_SIZE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label, lang) }))}
              className="w-64 min-w-[14rem] text-base"
            />
            <Button onClick={printQz} loading={qzBusy} disabled={!saleData || !settings || !url}>{t('print', lang)}</Button>
            {url && <a href={url} download={`receipt-${saleData?.invoice_number || 'sale'}.pdf`} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">{t('download', lang)}</a>}
            <Button variant="secondary" onClick={() => (returnTo ? navigate(returnTo) : navigate(-1))}>{t('go_back', lang)}</Button>
          </div>
        </div>
        {!saleData && <div className="bg-white rounded shadow p-8 text-center text-sm text-gray-500">{t('no_receipt_data', lang)}</div>}
        {url && <iframe id="receipt-frame" title="receipt" src={url} className="w-full h-[75vh] bg-white rounded shadow border-0" />}
      </div>
    </MainLayout>
  );
}
