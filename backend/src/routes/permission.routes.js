import * as _n60 from 'express';
const express = _n60.default ?? _n60;
const router = express.Router();

import * as permissionController from '../controllers/permission.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
// Require authentication for all routes
router.use(authMiddleware);

// Get all permissions
router.get('/', permissionController.getPermissions);

// Update a permission
router.post('/', permissionController.updatePermission);

// Update bulk permissions
router.post('/bulk', permissionController.updateBulkPermission);

export default router;