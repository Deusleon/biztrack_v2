import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { salesService } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDate } from '../utils/dateFormat';
import { t } from '../utils/i18n';

/**
 * Opened by the QR code on a receipt. No sign-in, and no way into the rest of BizTrack.
 * The only job of this page is to say whether the receipt is genuine.
 */
export default function VerifyReceipt() {
  const [params] = useSearchParams();
  const { lang } = useLanguage();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    salesService.verifyReceipt({ invoice: params.get('invoice') || '', store: params.get('store') || '' })
      .then((r) => { if (!gone) setRow(r?.data && r.valid == null ? r.data : r); })
      .catch(() => { if (!gone) setRow({ valid: false }); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [params]);

  const ok = row?.valid === true || row?.verified === true;
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow w-full max-w-md p-6 text-left space-y-4" role="status">
        <h1 className="text-lg font-bold text-gray-900">{t('verify_receipt', lang)}</h1>
        {loading && <p className="text-sm text-gray-500">{t('loading', lang)}</p>}
        {!loading && !ok && (
          <p className="text-sm font-medium text-red-700 rounded-md bg-red-50 px-3 py-3">{t('receipt_not_verified', lang)}</p>
        )}
        {!loading && ok && (
          <>
            <p className="text-sm font-medium text-green-800 rounded-md bg-green-50 px-3 py-3">{t('receipt_verified', lang)}</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('business_name', lang)}</dt><dd className="font-medium text-right">{row.business_name || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('invoice_number', lang)}</dt><dd className="font-medium">#{row.invoice_number}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('date', lang)}</dt><dd>{formatDate(row.sales_date)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('total', lang)}</dt><dd className="font-medium">{Number.isFinite(Number(row.total_amount)) ? Number(row.total_amount).toLocaleString('en-US') : row.total_amount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('status', lang)}</dt><dd>{t(row.status, lang)}</dd></div>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
