import * as _n40 from 'express';
const express = _n40.default ?? _n40;
import * as receiptVerifyController from '../controllers/receiptVerify.controller.js';

const router = express.Router();

// Public — no auth. Scanned from a printed receipt QR code.
router.get('/verify', receiptVerifyController.verifyReceipt);
router.get('/:invoiceNumber', receiptVerifyController.verifyReceipt);

export default router;
