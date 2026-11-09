import * as _n55 from 'express';
const express = _n55.default ?? _n55;
const router = express.Router();
import authMiddleware from '../middlewares/authMiddleware.js';
import * as expenseController from '../controllers/expense.controller.js';
import { checkStorePermission } from '../middlewares/permissions.js';
router.get('/', authMiddleware, checkStorePermission(['view_expenses', 'create_expenses', 'update_expenses']), expenseController.getExpenses);
router.get('/categories', authMiddleware, checkStorePermission(['view_expenses', 'create_expenses', 'update_expenses']), expenseController.getExpenseCategories);

router.post(
  '/',
  authMiddleware,
  checkStorePermission(['create_expenses']),
  expenseController.createExpense,
);

router.put(
  '/:id',
  authMiddleware,
  checkStorePermission(['update_expenses']),
  expenseController.updateExpense,
);

router.delete(
  '/:id',
  authMiddleware,
  checkStorePermission(['delete_expenses']),
  expenseController.deleteExpense,
);

export default router;