import * as _n74 from 'express';
const express = _n74.default ?? _n74;
const router = express.Router();
import { forgotPassword } from '../../controllers/auth/forgotPasswordController.js';
import { emailActionLimiter } from '../../middlewares/authRateLimit.js';
// Forgot password route
router.post('/', emailActionLimiter, forgotPassword);

export default router;