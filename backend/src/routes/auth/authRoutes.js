import * as _n71 from 'express';
const express = _n71.default ?? _n71;
const router = express.Router();
import * as authController from '../../controllers/auth/authController.js';
import verifyToken from '../../middlewares/authMiddleware.js';
import { loginLimiter, loginIpLimiter, registerLimiter, emailActionLimiter, verifyPasswordLimiter } from '../../middlewares/authRateLimit.js';
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginIpLimiter, loginLimiter, authController.login);
router.post('/verify-password', verifyToken, verifyPasswordLimiter, authController.verifyPassword);
router.post('/logout', authController.logout);
router.post('/resend-email', emailActionLimiter, authController.resendEmail);
router.post('/switch-store', verifyToken, authController.switchStore);

export default router;