import * as _n44 from 'express';
const express = _n44.default ?? _n44;
const router = express.Router();

import * as roleController from '../controllers/role.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import invalidateAccessOnWrite from '../middlewares/invalidateAccessOnWrite.js';
import { checkStorePermission } from '../middlewares/permissions.js';
// Require authentication for all routes
router.use(authMiddleware);
router.use(invalidateAccessOnWrite);

// Add a new role
router.post('/', checkStorePermission(['create_roles']), roleController.addRole);

// Get all roles
router.get('/', checkStorePermission(['view_roles', 'view_users', 'edit_users', 'manage_permissions', 'create_roles', 'edit_roles']), roleController.getRoles);

// Update a role
router.put('/:id', checkStorePermission(['edit_roles']), roleController.updateRole);

// Delete a role
router.delete('/:id', checkStorePermission(['delete_roles']), roleController.deleteRole);

export default router;