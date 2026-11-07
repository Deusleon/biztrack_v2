import pool from '../../config/db.js';
import { t } from '../../utils/translate.js';
export const verifyEmail = async (req, res) => {
    const { token } = req.body;
    const lang = req.headers['x-language'] || 'en';
    if (!token) {
        return res.status(400).json({ message: t('token_not_sent', lang) });
    }
    try {
        // Check if token is valid and not expired
        const result = await pool.query(
            'SELECT * FROM email_verification_tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: t('invalid_or_expired_token', lang) });
        }

        const email = result.rows[0].email;

        // Optional check before update
        const userCheck = await pool.query('SELECT is_verified FROM users WHERE email = $1', [email]);
        if (userCheck.rows[0]?.is_verified) {
            return res.status(200).json({ message: t('email_already_verified', lang) });
        }

        // Update user's status to verified
        await pool.query('UPDATE users SET is_verified = $1 WHERE email = $2', [true, email]);

        // Delete the token after successful verification
        await pool.query('DELETE FROM email_verification_tokens WHERE email = $1', [email]);

        return res.status(200).json({ message: t('email_verified_success', lang) });
    } catch (err) {
        console.error('Email verifications error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

