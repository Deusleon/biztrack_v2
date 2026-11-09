import pool from '../config/db.js';
import * as _n9 from 'bcryptjs';
const bcrypt = _n9.default ?? _n9;
import { logActivity } from '../utils/activityLog.js';
import { t } from '../utils/translate.js';
import { getIO } from '../utils/socket.js';
// Add user to store with a role
export const addUserToStore = async (req, res) => {
    const { store_id, user_id, role_id } = req.body;
    const lang = req.user.preferred_language || req.headers['x-language'] || 'en';

    try {
        // Check if store exists
        const storeResult = await pool.query('SELECT * FROM stores WHERE id = $1', [store_id]);
        if (storeResult.rows.length === 0) {
            return res.status(404).json({ message: t('store_not_found', lang) });
        }

        // Check if user exists
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: t('user_not_found', lang) });
        }

        // Check if role exists
        const roleResult = await pool.query('SELECT * FROM roles WHERE id = $1', [role_id]);
        if (roleResult.rows.length === 0) {
            return res.status(404).json({ message: t('role_not_found', lang) });
        }

        // Check if user is already in store
        const existing = await pool.query(
            'SELECT * FROM store_users WHERE store_id = $1 AND user_id = $2',
            [store_id, user_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: t('user_already_in_store', lang) });
        }

        // Add user to store
        const result = await pool.query(
            `INSERT INTO store_users (store_id, user_id, role_id, status, joined_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
            [store_id, user_id, role_id, true]
        );

        await logActivity(pool, {
          userId: req.user.id,
          storeId: store_id,
          action: "add_user_to_store",
          description: {
            user_id: user_id,
            role_id: role_id,
          },
          ip: req.ip,
        });
        
        res.status(201).json({
            message: t('user_added_to_store', lang),
            store_user: result.rows[0]
        });
    } catch (err) {
        console.error('Add user to store error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};


export const createUserForStore = async (req, res) => {
  const { full_name, email, password, role, status } = req.body;
  const lang = req.user.preferred_language || req.headers['x-language'] || 'en';
  const storeId = req.user.current_store_role.store_id;
 
  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ message: t('missing_required_fields', lang) });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: t('password_too_short_8', lang) });
  }
 
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
 
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: t('email_exists', lang) });
    }
 
    // the role must belong to THIS store (a name like "Manager" exists in every store), and nobody is made an Owner here
    const roleRes = await client.query('SELECT id, name FROM roles WHERE store_id = $1 AND (name = $2 OR id::text = $2)', [storeId, String(role)]);
    if (roleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: t('role_not_found', lang) });
    }
    if (String(roleRes.rows[0].name).toLowerCase() === 'owner') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: t('owner_role_not_assignable', lang) });
    }
    const roleId = roleRes.rows[0].id;
 
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const isActive = status !== false; // defaults to enabled unless explicitly disabled
 
    const userRes = await client.query(
      `INSERT INTO users (name, email, password, preferred_language, status, is_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, email, preferred_language, status, created_at`,
      [full_name, email, hashedPassword, lang, isActive],
    );
    const newUser = userRes.rows[0];
 
    await client.query(
      `INSERT INTO store_users (store_id, user_id, role_id, status, joined_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [storeId, newUser.id, roleId, isActive],
    );
 
    const joinedRes = await client.query(
      `SELECT u.id, u.name, u.email, u.preferred_language, u.status, u.created_at,
              su.role_id, r.name AS role_name, su.store_id, s.name AS store_name
       FROM users u
       JOIN store_users su ON su.user_id = u.id
       JOIN roles r ON r.id = su.role_id
       JOIN stores s ON s.id = su.store_id
       WHERE u.id = $1 AND su.store_id = $2`,
      [newUser.id, storeId],
    );
 
    const row = joinedRes.rows[0];
    const createdUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      preferred_language: row.preferred_language,
      status: row.status,
      created_at: row.created_at,
      storeInfo: {
        role_id: row.role_id,
        role_name: row.role_name,
        store_id: row.store_id,
        store_name: row.store_name,
      },
    };
 
    await client.query('COMMIT');
 
    await logActivity(pool, {
      userId: req.user.id,
      storeId,
      action: 'admin_create_user',
      description: { created_user_id: newUser.id, email, role },
      ip: req.ip,
    });
 
    // Same event shape the frontend already listens for (self-registration
    // emits this too) — UsersPage's socket listener picks this up with no
    // changes needed, and the new user appears in the table instantly.
    const io = getIO();
    const payload = { user: createdUser, message: 'new_user_registered' };
    io.to(`store_${storeId}_Owner`).emit('userRegistered', payload);
    io.to(`store_${storeId}_Manager`).emit('userRegistered', payload);
 
    res.status(201).json({
      message: t('user_created_successfully', lang),
      user: createdUser,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin create user error:', err.message);
    res.status(500).json({ message: t('server_error', lang) });
  } finally {
    client.release();
  }
};

// Get all users in a store
export const getStoreUsers = async (req, res) => {
    const { store_id } = req.params;
    const lang = req.user.lang || req.headers['x-language'] || 'en';
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';

    try {
        // 1) Check if store exists
        const storeResult = await pool.query('SELECT * FROM stores WHERE id = $1', [store_id]);
        if (storeResult.rows.length === 0) {
            return res.status(404).json({ message: t('store_not_found', lang) });
        }

        const searchFilter = search ? `AND (u.name ILIKE $2 OR u.email ILIKE $2)` : '';
        const countParams  = search ? [store_id, `%${search}%`] : [store_id];

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM users u JOIN store_users su ON su.user_id = u.id WHERE su.store_id = $1 AND u.is_verified = true ${searchFilter}`,
            countParams
        );
        const total = parseInt(countRes.rows[0].count, 10);

        const dataParams = search
            ? [store_id, `%${search}%`, limit, offset]
            : [store_id, limit, offset];
        const limitIdx  = search ? 3 : 2;
        const offsetIdx = search ? 4 : 3;

        // 2) Get users in the store
        const usersResult = await pool.query(
            `SELECT
                u.id,
                u.name,
                u.email,
                u.preferred_language,
                u.status,
                u.created_at,
                su.role_id,
                r.name AS role_name,
                su.store_id,
                s.name AS store_name
            FROM users u
            JOIN store_users su ON su.user_id = u.id
            JOIN roles r ON r.id = su.role_id
            JOIN stores s ON s.id = su.store_id
            WHERE su.store_id = $1 AND u.is_verified = true ${searchFilter}
            AND u.email != 'deusleon7@gmail.com' -- Exclude the developer account
            ORDER BY u.created_at ASC
            LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            dataParams
        );

        // 3) Arrange data in a required format 
        const usersData = usersResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            preferred_language: row.preferred_language,
            status: row.status,
            created_at: row.created_at,
            storeInfo: {
                role_id: row.role_id,
                role_name: row.role_name,
                store_id: row.store_id,
                store_name: row.store_name,
            },
        }));

        res.status(200).json({
            message: t('store_users_listed', lang),
            users: usersData,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        });
    } catch (err) {
        console.error('Get store users error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

// Update user's role in a store
export const updateStoreUserRole = async (req, res) => {
    const { id } = req.params; // store_user id
    const { role, status } = req.body;
    const lang = req.user.preferred_language || req.headers['x-language'] || 'en';

    const currentStoreId = req.user.current_store_role.store_id;
    try {
        // 1. Hakikisha user yupo kwa store hii
        const storeUserResult = await pool.query(
            'SELECT * FROM store_users WHERE user_id = $1 AND store_id = $2',
            [id, currentStoreId]
        );
        if (storeUserResult.rows.length === 0) {
            return res
                .status(404)
                .json({ message: t('store_user_not_found', lang) });
        }
        const storeUser = storeUserResult.rows[0];

        // 2. Hakikisha role mpya ipo
        // the Owner can't be changed here, and nobody can be made an Owner here (an `edit_users` holder could otherwise promote themselves)
        const currentRole = await pool.query('SELECT name FROM roles WHERE id = $1', [storeUser.role_id]);
        if (String(currentRole.rows[0]?.name || '').toLowerCase() === 'owner') {
            return res.status(403).json({ message: t('cannot_edit_owner', lang) });
        }
        // the new role must belong to THIS store
        const roleCheckResult = await pool.query('SELECT id, name FROM roles WHERE id = $1 AND store_id = $2', [role, currentStoreId]);
        if (roleCheckResult.rows.length === 0) {
            return res.status(404).json({ message: t('role_not_found', lang) });
        }
        if (String(roleCheckResult.rows[0].name).toLowerCase() === 'owner') {
            return res.status(403).json({ message: t('owner_role_not_assignable', lang) });
        }
        const newRoleId = roleCheckResult.rows[0].id;


        // 3. Update role_id na status katika store_users
        const updateStoreUserResult = await pool.query(
            `UPDATE store_users SET role_id = $1, status  = $2
            WHERE user_id = $3 AND store_id = $4 RETURNING *`,
            [newRoleId, status, id, currentStoreId]
        );
        const updatedStoreUser = updateStoreUserResult.rows[0];

        // 4. Update status kwenye users table
        // (the original also set users.status here, which switched the person off in EVERY store they belong to;
        //  the per-store status above is what the store's permission checks honour)


        // 5. Rudisha tena data kamili (JOIN kwenye users, roles, stores)
        const updatedResult = await pool.query(
            `SELECT 
                u.id,
                u.name,
                u.email,
                u.preferred_language,
                u.status,
                u.created_at,
                su.role_id,
                r.name AS role_name,
                su.store_id,
                s.name AS store_name
            FROM store_users su
            JOIN users u   ON u.id = su.user_id
            JOIN roles r   ON r.id = su.role_id
            JOIN stores s  ON s.id = su.store_id
            WHERE su.user_id = $1 
                AND su.store_id = $2`,
            [id, currentStoreId]
        );
        const row = updatedResult.rows[0];

        // 6. Tengeneza payload yenye structure unayotaka
        const updatedUserPayload = {
            id: row.id,
            name: row.name,
            email: row.email,
            preferred_language: row.preferred_language,
            status: row.status,
            created_at: row.created_at,
            storeInfo: {
                role_id: row.role_id,
                role_name: row.role_name,
                store_id: row.store_id,
                store_name: row.store_name,
            },
        };

        // 7. Emit socket event kwa Owner na Manager wa store hii
        const io = getIO();
        const payload = {
            user: updatedUserPayload,
            message: 'store_user_updated',
        };
        io.to(`store_${currentStoreId}_Owner`).emit("userUpdated", payload);
        io.to(`store_${currentStoreId}_Manager`).emit("userUpdated", payload);

        // 8. Response
        await logActivity(pool, {
          userId: req.user.id,
          storeId: currentStoreId,
          action: "update_store_user_role",
          description: {
            user_id: storeUser.user_id,
            role: role,
            status,
          },
          ip: req.ip,
        });
        
        res.status(200).json({
            message: 'user_updated_successfully',
            store_user: updatedUserPayload
        });
    } catch (err) {
        console.error('Update store user role error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

// Remove a user from a store
export const removeUserFromStore = async (req, res) => {
    const { id } = req.params; // the person's USER id
    const lang = req.user.preferred_language || req.headers['x-language'] || 'en';

    try {
        const storeId = req.user.current_store_role.store_id;
        // The person must belong to THIS store. (The original looked them up in every store and then deleted the whole account —
        // anyone with the permission could delete any account in the system, the owner of another shop included.)
        const storeUser = await pool.query(
            'SELECT su.id, r.name AS role_name FROM store_users su LEFT JOIN roles r ON r.id = su.role_id WHERE su.user_id = $1 AND su.store_id = $2',
            [id, storeId]
        );
        if (storeUser.rows.length === 0) {
            return res.status(404).json({ message: t('store_user_not_found', lang) });
        }
        if (String(storeUser.rows[0].role_name || '').toLowerCase() === 'owner') {
            return res.status(403).json({ message: t('cannot_delete_owner', lang) });
        }
        if (id === req.user.id) {
            return res.status(403).json({ message: t('cannot_remove_self', lang) });
        }
        // Take them out of THIS store only.
        await pool.query('DELETE FROM store_users WHERE user_id = $1 AND store_id = $2', [id, storeId]);
        // If they now belong to no store at all, remove the account too — unless it already created records (sales, customers…),
        // in which case it is switched off instead so that history keeps its author.
        const left = await pool.query('SELECT 1 FROM store_users WHERE user_id = $1 LIMIT 1', [id]);
        const owns = await pool.query('SELECT 1 FROM stores WHERE owner_id = $1 LIMIT 1', [id]);
        if (left.rows.length === 0 && owns.rows.length === 0) {
            try { await pool.query('DELETE FROM users WHERE id = $1', [id]); }
            catch (e) { if (e.code === '23503') await pool.query('UPDATE users SET status = false WHERE id = $1', [id]); else throw e; }
        }

        const io = getIO();
        io.to(`store_${storeId}_Owner`).emit("userDeleted", {
            message: 'store_user_deleted',
            id: id
        });
        io.to(`store_${storeId}_Manager`).emit("userDeleted", {
            message: 'store_user_deleted',
            id: id
        });
        await logActivity(pool, {
          userId: req.user.id,
          storeId: storeId,
          action: "remove_user_from_store",
          description: {
            user_id: id,
          },
          ip: req.ip,
        });
        
        res.status(200).json({ message: t('store_user_removed', lang) });
    } catch (err) {
        console.error('Remove store user error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

