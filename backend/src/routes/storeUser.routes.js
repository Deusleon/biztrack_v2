import * as _n68 from 'express';
const express = _n68.default ?? _n68;
const router = express.Router();

import * as storeUserController from '../controllers/storeUser.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import invalidateAccessOnWrite from '../middlewares/invalidateAccessOnWrite.js';
import { checkStorePermission } from '../middlewares/permissions.js';
// All routes below require authentication
router.use(authMiddleware);
router.use(invalidateAccessOnWrite);

// POST: Add EXISTING user to a store (unchanged)
router.post('/', checkStorePermission(['edit_users']), storeUserController.addUserToStore);

// POST: Admin creates a BRAND NEW user directly (name/email/password/role) — new
router.post('/create-user', checkStorePermission(['edit_users']), storeUserController.createUserForStore);

// GET: Get all users in a specific store
router.get('/:store_id/users', checkStorePermission(['view_users', 'edit_users']), storeUserController.getStoreUsers);

// PUT: Update a user's role in a store
router.put('/:id', checkStorePermission(['edit_users']), storeUserController.updateStoreUserRole);

// DELETE: Remove a user from a store
router.delete('/:id', checkStorePermission(['delete_users', 'edit_users']), storeUserController.removeUserFromStore);

export default router;