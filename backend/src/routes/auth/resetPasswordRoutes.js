import * as _n73 from 'express';
const express = _n73.default ?? _n73;
const router = express.Router();
import { resetPassword, verifyResetToken } from '../../controllers/auth/resetPasswordController.js';
// Reset password route
router.post('/', resetPassword);
router.get('/verify', verifyResetToken); // ✅ verify token via query params

export default router;