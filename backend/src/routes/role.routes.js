import * as _n44 from 'express';
const express = _n44.default ?? _n44;
const router = express.Router();

import * as roleController from '../controllers/role.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
// Require authentication for all routes
router.use(authMiddleware);

// Add a new role
router.post('/', roleController.addRole);

// Get all roles
router.get('/', roleController.getRoles);

// Update a role
router.put('/:id', roleController.updateRole);

// Delete a role
router.delete('/:id', roleController.deleteRole);

export default router;