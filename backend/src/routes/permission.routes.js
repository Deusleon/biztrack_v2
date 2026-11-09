import * as _n60 from 'express';
const express = _n60.default ?? _n60;
const router = express.Router();

import * as permissionController from '../controllers/permission.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import invalidateAccessOnWrite from '../middlewares/invalidateAccessOnWrite.js';
import { checkStorePermission } from '../middlewares/permissions.js';
// Require authentication for all routes
router.use(authMiddleware);
router.use(invalidateAccessOnWrite);

// Get all permissions
router.get('/', checkStorePermission(['view_permissions', 'manage_permissions', 'view_roles', 'edit_roles']), permissionController.getPermissions);

// Update a permission
router.post('/', checkStorePermission(['manage_permissions']), permissionController.updatePermission);

// Update bulk permissions
router.post('/bulk', checkStorePermission(['manage_permissions']), permissionController.updateBulkPermission);

export default router;