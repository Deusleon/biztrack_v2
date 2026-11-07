import * as _n69 from 'express';
const express = _n69.default ?? _n69;
const router = express.Router();
import authMiddleware from '../middlewares/authMiddleware.js';
import * as dashboardController from '../controllers/dashboard.controller.js';
router.get('/stats', authMiddleware, dashboardController.getDashboardStats);

export default router;