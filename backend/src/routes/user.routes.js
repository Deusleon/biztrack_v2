import * as _n50 from 'express';
const express = _n50.default ?? _n50;
const router = express.Router();
import * as userController from '../controllers/user.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
// Get current user's permissions
router.get('/permissions', verifyToken, userController.getCurrentUserPermissions);

// Check specific permission for current user
router.get('/check-permission', verifyToken, userController.checkUserPermission);

export default router;