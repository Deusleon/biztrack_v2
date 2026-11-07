import * as _n72 from 'express';
const express = _n72.default ?? _n72;
const router = express.Router();
import * as verifyEmailController from '../../controllers/auth/verifyEmailController.js';
// Route to verify email via token
router.post('/', verifyEmailController.verifyEmail);

export default router;