// FILE PATH: frontend/src/pages/sales/Receipt.jsx
import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { Button, Select } from '../../components/ui';
import { generateReceiptPDFUrl } from '../../utils/receiptPdf';
import { buildReceiptData, RECEIPT_SIZE_OPTIONS } from '../../utils/receiptData';
import { t } from '../../utils/i18n';

/** Shows the receipt exactly as it will print (BizTrack's own PDF layout), with size choice, print and download. */
export default function Receipt() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const saleData = state?.saleData;
  const [size, setSize] = useState('80mm');

  useEffect(() => { if (settings?.defaultReceiptSize) setSize(settings.defaultReceiptSize); }, [settings?.defaultReceiptSize]);

  const url = useMemo(() => {
    if (!saleData || !settings) return null;
    try { return generateReceiptPDFUrl(buildReceiptData({ sale: saleData, settings, cashierName: user?.name }), size); } catch (e) { console.error('Receipt error:', e); return null; }
  }, [saleData, settings, size, user?.name]);
  useEffect(() => () => { if (url) URL.revokeObjectURL?.(url); }, [url]);

  const print = () => { const f = document.getElementById('receipt-frame'); f?.contentWindow?.focus(); f?.contentWindow?.print(); };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{t('receipt', lang)}</h1>
            {saleData?.invoice_number && <p className="text-sm text-gray-500 mt-0.5">#{saleData.invoice_number}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select size="sm" value={size} onChange={(e) => setSize(e.target.value)} options={RECEIPT_SIZE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label, lang) }))} className="w-48" />
            <Button variant="secondary" onClick={print} disabled={!url}>{t('print', lang)}</Button>
            {url && <a href={url} download={`receipt-${saleData?.invoice_number || 'sale'}.pdf`} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">{t('download', lang)}</a>}
            <Button onClick={() => navigate('/sales/invoice')}>{t('new_sale', lang)}</Button>
          </div>
        </div>
        {!saleData && <div className="bg-white rounded shadow p-8 text-center text-sm text-gray-500">{t('no_receipt_data', lang)}</div>}
        {url && <iframe id="receipt-frame" title="receipt" src={url} className="w-full h-[75vh] bg-white rounded shadow border-0" />}
      </div>
    </MainLayout>
  );
}
