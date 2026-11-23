import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { salesService } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { showDate } from '../../utils/dateFormat';
import { t } from '../../utils/i18n';

/** Opened by the QR code on a receipt. No sign-in. Shows only enough to confirm the sale is real. */
export default function VerifyReceipt() {
  const [params] = useSearchParams();
  const { lang } = useLanguage();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    salesService.verifyReceipt({ invoice: params.get('invoice') || '', store: params.get('store') || '' })
      .then((r) => { if (!gone) setRow(r); })
      .catch(() => { if (!gone) setRow({ valid: false }); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [params]);

  const ok = row?.valid;
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded shadow w-full max-w-md p-6 text-left space-y-4">
        <h1 className="text-lg font-bold text-gray-900">{t('verify_receipt', lang)}</h1>
        {loading && <p className="text-sm text-gray-500">{t('loading', lang)}</p>}
        {!loading && !ok && <p className="text-sm text-red-700">{t('receipt_not_verified', lang)}</p>}
        {!loading && ok && (
          <>
            <p className="text-sm font-medium text-green-700">{t('receipt_verified', lang)}</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('business_name', lang)}</dt><dd className="font-medium text-right">{row.business_name || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('invoice_number', lang)}</dt><dd className="font-medium">#{row.invoice_number}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('date', lang)}</dt><dd>{showDate(row.sales_date)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('total', lang)}</dt><dd className="font-medium">{Number.isFinite(Number(row.total_amount)) ? Number(row.total_amount).toLocaleString('en-US') : row.total_amount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('status', lang)}</dt><dd>{t(row.status, lang)}</dd></div>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
