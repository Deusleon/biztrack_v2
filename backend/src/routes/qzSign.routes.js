import * as _n61 from 'express';
const express = _n61.default ?? _n61;
import * as qzSignController from '../controllers/qzSign.controller.js';
const router = express.Router();

// No auth middleware — QZ Tray signing must work before user login
router.post('/sign', qzSignController.sign);

export default router;