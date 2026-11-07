import pool from '../../config/db.js';
import * as _n16 from 'bcryptjs';
const bcrypt = _n16.default ?? _n16;
import { t } from '../../utils/translate.js';

// Reset password
export const resetPassword = async (req, res) => {
    const { email, token, password } = req.body;
    const lang = req.headers['x-language'] || 'en';

    if (password.length < 6) {
        return res.status(400).json({ message: t('password_too_short', lang) });
    }

    try {
        // Get user by email
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: t('user_not_found', lang) });
        }

        const userId = userResult.rows[0].id;

        // Check if the token is valid and not expired
        const result = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [userId, token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: t('invalid_or_expired_token', lang) });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update user's password
        await pool.query(`UPDATE users SET password = $1, password_changed_at = NOW(), failed_login_attempts = 0, account_locked_until = NULL, updated_at = NOW() WHERE id = $2`, [hashedPassword, userId]);

        // Delete the reset token
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

        res.status(200).json({ message: t('password_reset_success', lang) });
    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

export const verifyResetToken = async (req, res) => {
    const { email, token } = req.query;
    const lang = req.headers['x-language'] || 'en';

    try {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: t('user_not_found', lang) });
        }

        const userId = userResult.rows[0].id;

        const result = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [userId, token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: t('invalid_or_expired_token', lang) });
        }

        return res.status(200).json({ message: t('token_valid', lang) });
    } catch (err) {
        console.error('Verify reset token error:', err.message);
        return res.status(500).json({ message: t('server_error', lang) });
    }
};

