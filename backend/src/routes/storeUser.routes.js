import * as _n68 from 'express';
const express = _n68.default ?? _n68;
const router = express.Router();

import * as storeUserController from '../controllers/storeUser.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
// All routes below require authentication
router.use(authMiddleware);

// POST: Add EXISTING user to a store (unchanged)
router.post('/', storeUserController.addUserToStore);

// POST: Admin creates a BRAND NEW user directly (name/email/password/role) — new
router.post('/create-user', checkStorePermission(['edit_users']), storeUserController.createUserForStore);

// GET: Get all users in a specific store
router.get('/:store_id/users', storeUserController.getStoreUsers);

// PUT: Update a user's role in a store
router.put('/:id', storeUserController.updateStoreUserRole);

// DELETE: Remove a user from a store
router.delete('/:id', storeUserController.removeUserFromStore);

export default router;