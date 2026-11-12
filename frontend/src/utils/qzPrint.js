import qz from 'qz-tray';
import api from './api';
import certificate from '../assets/qz-tray-cert/digital-certificate.txt?raw';

let qzConnected = false;

qz.security.setCertificatePromise((resolve) => {
  resolve(certificate);
});
qz.security.setSignatureAlgorithm('SHA512');
qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
  api.post('/qz/sign', { request: toSign })
    .then((res) => resolve(res.signature))
    .catch((err) => reject(err));
});

/** Connect to QZ Tray on this computer. It has to be running. */
export const connectQZ = async () => {
  if (qzConnected && qz.websocket.isActive()) return;
  try {
    await qz.websocket.connect();
    qzConnected = true;
  } catch (err) {
    if (err?.message && err.message.includes('Already connected')) { qzConnected = true; return; }
    throw new Error('QZ Tray is not running. Start QZ Tray to print without a dialog.');
  }
};

export const printReceipt = async ({ pdfBase64, printerName, receiptSize = '80mm' }) => {
  await connectQZ();
  const printer = printerName ? await qz.printers.find(printerName) : await qz.printers.getDefault();
  const documents = { A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 } };
  const paperWidths = { '58mm': { width: '48mm' }, '80mm': { width: '72mm' } };
  const page = documents[receiptSize];
  const paper = paperWidths[receiptSize] || paperWidths['80mm'];
  const config = qz.configs.create(printer, page
    ? { size: page, units: 'mm', margins: 0, scaleContent: true, rasterize: true }
    : {
      size: { width: paper.width, height: null },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      units: 'mm',
      scaleContent: true,
      rasterize: true,
    });
  await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: pdfBase64 }]);
};

/** Send a receipt straight to the default printer. No browser print window. */
export const printReceiptDirect = async ({ receiptData, printerName, receiptSize = '80mm' }) => {
  const { generateReceiptPDFBase64 } = await import('./receiptPdf'); // the PDF engine is only needed when something is printed
  const pdfBase64 = generateReceiptPDFBase64(receiptData, receiptSize);
  await printReceipt({ pdfBase64, printerName, receiptSize });
};
