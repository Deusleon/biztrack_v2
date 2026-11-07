import * as _n37 from 'express';
const express = _n37.default ?? _n37;
const router = express.Router();

import authenticate from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
// Test route
router.get(
  '/test-role/:storeId',
  authenticate,                          // Lazima awe logged in
  checkStorePermission(['view_users']), // Lazima awe na mojawapo ya hizi roles
  (req, res) => {
    return res.json({
      success: true,
      message: 'User has required role in this store!'
    });
  }
);

export default router;