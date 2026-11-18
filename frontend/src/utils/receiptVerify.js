import QRCode from 'qrcode';

/**
 * Build the public URL encoded in a receipt QR code.
 * Scanning opens the verify page with invoice + store so the receipt can be confirmed.
 */
export function buildReceiptVerifyUrl({ invoiceNumber, storeId, origin } = {}) {
  if (!invoiceNumber || !storeId) return '';
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const params = new URLSearchParams({ invoice: String(invoiceNumber), store: String(storeId) });
  return `${base}/verify-receipt?${params.toString()}`;
}

/** PNG data URL for embedding a verification QR into the receipt PDF. */
export async function generateReceiptQrDataUrl(verifyUrl) {
  if (!verifyUrl) return null;
  return QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
