import pool from '../../config/db.js';
import * as _n13 from 'bcryptjs';
const bcrypt = _n13.default ?? _n13;
import crypto from 'crypto';
import sendEmail from '../../utils/emailService.js';
import { t } from '../../utils/translate.js';

// Forgot password
export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const lang = req.headers['x-language'] || 'en';

    try {
        // Check if user exists
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: t('user_not_found', lang) });
        }

        const user = userResult.rows[0];
        const userId = user.id;  // Get user ID from the result

        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        const resetLink = `${process.env.CLIENT_URL}/new-password?token=${token}&email=${email}`;
        const logoURL = `${process.env.CLIENT_LOGO_URL}`;

        // Save token in DB with expiration time, use user_id instead of email
        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
            [userId, token]
        );

        // Send reset email
        await sendEmail({
            to: email,
            subject: t('reset_password_subject', lang),
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; text-align: justify; color: #5f6268;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2>${logoURL}</h2>
                    </div>

                    <p>${t('email_greeting', lang)},</p>

                    <p>${t('reset_password_message', lang)}</p>

                    <div style="text-align: center; margin: 16px 0;">
                        <a href="${resetLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        ${t('reset_password_button', lang)}
                        </a>
                    </div>

                    <p>${t('alternative_link_text', lang)}:</p>
                    <p style="text-align: left;">
                        <a href="${resetLink}" style="color: #2563EB; text-decoration: underline;">${resetLink}</a>
                    </p>

                    <p><strong>${t('note', lang)}:</strong> ${t('email_note', lang)}</p>

                    <p>${t('ignore_email_note', lang)}</p>

                    <br />
                    <span style="color: #7c8392; font-size: 15px;">${t('regards', lang)},</span><br /><br />
                    <span style="color: #7c8392; font-size: 15px;">${t("team_signature", lang)}</span>

                    <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
                    <p style="font-size: 12px; color: #7c8392;">
                        ${t('automated_email_note', lang)}
                    </p>
                    <div style="margin-top: 30px; font-size: 12px; color: #7c8392; text-align: center;">
                        &copy; ${new Date().getFullYear()} BizTrack. ${t('all_rights_reserved', lang)}
                    </div>
                </div>
            `
        });

        res.status(200).json({ message: t('reset_password_email_sent', lang) });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

