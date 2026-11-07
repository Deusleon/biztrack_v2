import * as _n71 from 'express';
const express = _n71.default ?? _n71;
const router = express.Router();
import * as authController from '../../controllers/auth/authController.js';
import verifyToken from '../../middlewares/authMiddleware.js';
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-password', verifyToken, authController.verifyPassword);
router.post('/logout', authController.logout);
router.post('/resend-email', authController.resendEmail);
router.post('/switch-store', verifyToken, authController.switchStore);

export default router;