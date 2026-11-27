import qz from 'qz-tray';
import api from './api';
import certificate from '../assets/qz-tray-cert/digital-certificate.txt?raw';

let qzConnected = false;
let signProblem = '';

qz.security.setCertificatePromise((resolve) => {
  resolve(certificate);
});
qz.security.setSignatureAlgorithm('SHA512');
qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
  api.post('/qz/sign', { request: toSign })
    .then((res) => {
      if (!res?.signature) {
        signProblem = 'The printer signature came back empty.';
        reject(new Error(signProblem));
        return;
      }
      signProblem = '';
      resolve(res.signature);
    })
    .catch((err) => {
      signProblem = err?.message || 'Could not reach the server to sign the print.';
      reject(err);
    });
});

// QZ Tray replaces every signing failure with "Failed to sign request". Keep the server's reason.
const explainSignError = (err) => (err?.message === 'Failed to sign request' && signProblem ? new Error(signProblem) : err);

/** Connect to QZ Tray on this computer. It has to be running. */
export const connectQZ = async () => {
  if (qzConnected && qz.websocket.isActive()) return;
  try {
    await qz.websocket.connect();
    qzConnected = true;
  } catch (err) {
    if (err?.message && err.message.includes('Already connected')) { qzConnected = true; return; }
    if (err?.message === 'Failed to sign request') throw explainSignError(err);
    throw new Error('QZ Tray is not running. Start QZ Tray to print without a dialog.');
  }
};

export const printReceipt = async ({ pdfBase64, printerName, receiptSize = '80mm', pageWidth, pageHeight }) => {
  await connectQZ();
  let printer;
  try {
    printer = printerName ? await qz.printers.find(printerName) : await qz.printers.getDefault();
  } catch (err) {
    throw explainSignError(err);
  }
  // The PDF page is already the paper size. Tell the printer that exact size, in inches,
  // and rasterize at the printer's own resolution so the type is not stretched.
  const fallback = { '58mm': [48, 200], '80mm': [72, 200], A5: [148, 210], A4: [210, 297] };
  const [fallbackW, fallbackH] = fallback[receiptSize] || fallback['80mm'];
  const widthMm = pageWidth || fallbackW;
  const heightMm = pageHeight || fallbackH;
  const thermal = receiptSize === '58mm' || receiptSize === '80mm';
  const config = qz.configs.create(printer, {
    units: 'in',
    size: { width: widthMm / 25.4, height: heightMm / 25.4 },
    margins: 0,
    scaleContent: true,
    rasterize: true,
    colorType: 'grayscale',
    interpolation: 'bicubic',
    density: thermal ? 203 : 300,
    fallbackDensity: thermal ? 203 : 300,
  });
  try {
    await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: pdfBase64 }]);
  } catch (err) {
    throw explainSignError(err);
  }
};

/** Send a receipt straight to the default printer. No browser print window. */
export const printReceiptDirect = async ({ receiptData, printerName, receiptSize = '80mm' }) => {
  const { generateReceiptPDFBase64Async } = await import('./receiptPdf'); // the PDF engine is only needed when something is printed
  const pdf = await generateReceiptPDFBase64Async(receiptData, receiptSize);
  await printReceipt({ pdfBase64: pdf.base64, printerName, receiptSize, pageWidth: pdf.width, pageHeight: pdf.height });
};
