// FILE PATH: frontend/src/utils/qzReceipt.js
// One place that sends a receipt straight to the printer through QZ Tray (no browser print window).
// QZ Tray's library and the PDF engine are loaded the first time someone prints this way, not with the page.
import { buildReceiptData } from './receiptData';

/**
 * saleData      the reply of a sale, or a sale loaded from history (same shapes utils/receiptData.js accepts)
 * settings      the store's settings
 * cashierName   shown on the receipt
 * size          '58mm' | '80mm' | 'A5' | 'A4' (default: the store's default receipt size)
 * Throws an Error with a readable message when QZ Tray is not running.
 */
export async function printReceiptViaQz({ saleData, settings, cashierName, size }) {
  const { printReceiptDirect } = await import('./qzPrint');
  await printReceiptDirect({
    receiptData: buildReceiptData({ sale: saleData, settings, cashierName }),
    receiptSize: size || settings?.defaultReceiptSize || '80mm',
  });
}
