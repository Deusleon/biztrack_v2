import * as _n73 from 'express';
const express = _n73.default ?? _n73;
const router = express.Router();
import { resetPassword, verifyResetToken } from '../../controllers/auth/resetPasswordController.js';
import { tokenLimiter } from '../../middlewares/authRateLimit.js';
// Reset password route
router.post('/', tokenLimiter, resetPassword);
router.get('/verify', tokenLimiter, verifyResetToken); // ✅ verify token via query params

export default router;