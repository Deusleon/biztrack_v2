import pool from '../config/db.js';
import { logActivity } from '../utils/activityLog.js';
import { respondWithError } from '../utils/response.js';
// ── List expenses ─────────────────────────────────────────────────────────
export const getExpenses = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate, category } = req.query;
  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  try {
    const params = [storeId];
    let where = 'WHERE e.store_id = $1';

    if (category && category !== 'all') {
      params.push(category);
      where += ` AND e.category = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      where += ` AND e.expense_date::date >= $${params.length}::date`;
    }

    if (endDate) {
      params.push(endDate);
      where += ` AND e.expense_date::date <= $${params.length}::date`;
    }

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.description ILIKE $${params.length} OR e.category ILIKE $${params.length} OR e.payment_method ILIKE $${params.length} OR e.reference_number ILIKE $${params.length})`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM expenses e ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT
         e.id,
         e.category,
         e.amount,
         e.description,
         e.payment_method,
         e.reference_number,
         e.expense_date,
         e.created_at,
         u.name AS recorded_by
       FROM expenses e
       LEFT JOIN users u ON e.user_id = u.id
       ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT COALESCE(SUM(e.amount), 0)::numeric AS total_amount
       FROM expenses e ${where}`,
      params.slice(0, params.length - 2),
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 },
    });
  } catch (err) {
    console.error('Get expenses error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// ── Create expense ────────────────────────────────────────────────────────
export const createExpense = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const { category, amount, description, payment_method, reference_number, expense_date } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return respondWithError(req, res, 400, 'validation_failed');
  }

  try {
    const result = await pool.query(
      `INSERT INTO expenses (store_id, user_id, category, amount, description, payment_method, reference_number, expense_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        storeId,
        userId,
        category?.trim() || 'General',
        parseFloat(amount),
        description?.trim() || null,
        payment_method || 'cash',
        reference_number?.trim() || null,
        expense_date || new Date().toISOString(),
      ],
    );

    await logActivity(pool, {
      userId: userId,
      storeId: storeId,
      action: "create_expense",
      description: {
        category,
        amount,
        payment_method,
        expense_date,
        description: description || undefined,
      },
      ip: req.ip,
    });
    
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create expense error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// ── Update expense ────────────────────────────────────────────────────────
export const updateExpense = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { id } = req.params;
  const { category, amount, description, payment_method, reference_number, expense_date } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return respondWithError(req, res, 400, 'validation_failed');
  }

  try {
    const result = await pool.query(
      `UPDATE expenses
       SET category = $1, amount = $2, description = $3, payment_method = $4,
           reference_number = $5, expense_date = $6, updated_at = NOW()
       WHERE id = $7 AND store_id = $8
       RETURNING *`,
      [
        category?.trim() || 'General',
        parseFloat(amount),
        description?.trim() || null,
        payment_method || 'cash',
        reference_number?.trim() || null,
        expense_date || new Date().toISOString(),
        id,
        storeId,
      ],
    );

    if (result.rows.length === 0) {
      return respondWithError(req, res, 404, 'not_found');
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "update_expense",
      description: {
        category,
        amount,
        payment_method,
        expense_date,
      },
      ip: req.ip,
    });
    
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update expense error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// ── Delete expense ────────────────────────────────────────────────────────
export const deleteExpense = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND store_id = $2 RETURNING id, category, amount`,
      [id, storeId],
    );

    if (result.rows.length === 0) {
      return respondWithError(req, res, 404, 'not_found');
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "delete_expense",
      description: {
        category: result.rows[0].category,
        amount: result.rows[0].amount,
      },
      ip: req.ip,
    });
    
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete expense error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// ── Get expense categories ────────────────────────────────────────────────
export const getExpenseCategories = async (req, res) => {
  const storeId = req.user.current_store_id;

  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM expenses WHERE store_id = $1 ORDER BY category ASC`,
      [storeId],
    );

    const defaultCategories = ['General', 'Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Other'];
    const dbCategories = result.rows.map((r) => r.category);
    const merged = [...new Set([...defaultCategories, ...dbCategories])].sort();

    return res.json({ success: true, data: merged });
  } catch (err) {
    console.error('Get expense categories error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

