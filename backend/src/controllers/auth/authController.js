import pool from '../../config/db.js';
import { stampOf, passwordStamp } from '../../utils/passwordStamp.js';
import * as _n14 from 'bcryptjs';
const bcrypt = _n14.default ?? _n14;
import * as _n15 from 'jsonwebtoken';
const jwt = _n15.default ?? _n15;
import crypto from 'crypto';
import sendEmail from '../../utils/emailService.js';
import { t } from '../../utils/translate.js';
import { getIO } from '../../utils/socket.js';
import { getUserPermissions } from '../../middlewares/checkPermission.js';
import { getStoreSecurityPolicy, isPasswordExpired } from '../../utils/securityPolicy.js';
import { notifyStore } from '../../services/notification.service.js';
import 'dotenv/config';
// Register user
export const register = async (req, res) => {
    const { full_name, email, password, preferred_language, store_code } = req.body;
    const lang = req.headers['x-language'] || preferred_language || 'en';
    let optUser = null;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Start transaction

        // Check if store code is valid
        const storeRes = await client.query('SELECT id, name as store_name FROM stores WHERE store_code = $1', [store_code]);
        if (storeRes.rows.length <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: t('store_not_found', lang) });
        }

        const storeId = storeRes.rows[0].id;
        const storeName = storeRes.rows[0].store_name;

        // Fetch the default role
        const defaultRoleRes = await client.query('SELECT id FROM roles WHERE name = $1', ['Pending']);
        if (defaultRoleRes.rows.length <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: t('role_not_found', lang) });
        }

        const roleId = defaultRoleRes.rows[0].id;

        // Check if user already exists
        const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: t('email_exists', lang) });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save user to DB
        const result = await client.query(
            `INSERT INTO users (name, email, password, preferred_language) 
             VALUES ($1, $2, $3, $4) RETURNING id, name, email, preferred_language, status, created_at`,
            [full_name, email, hashedPassword, lang]
        );

        const newUser = result.rows[0];
        const userId = newUser.id;

        // Assign user to a store
        const assignRes = await client.query(
            `INSERT INTO store_users (role_id, status, store_id, user_id) 
             VALUES ($1, false, $2, $3)`,
            [roleId, storeId, userId]
        );
        newUser.role = t("not_assigned", lang);

        // Generate email verification token
        const token = crypto.randomBytes(32).toString('hex');
        const verificationLink = `${process.env.CLIENT_URL}/verify-email?key=${token}`;
        const logoURL = `${process.env.CLIENT_LOGO_URL}`;
        // const resetLink = `${process.env.CLIENT_URL}/new-password?token=${token}&email=${email}`;

        // Save token in DB
        await client.query(
            'INSERT INTO email_verification_tokens (email, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'2 hours\')',
            [email, token]
        );

        //    Fetch everything in one joined query:
        const joinedRes = await client.query(
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
                WHERE u.id = $1 AND su.store_id = $2
            `,
            [userId, storeId]
        );

        if (joinedRes.rows.length === 0) {
            // This should not happen, but just in case:
            await client.query('ROLLBACK');
            return res.status(500).json({ message: t('server_error', lang) });
        }

        // Build optUser in the exact format required:
        const row = joinedRes.rows[0];
        optUser = {
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
                store_name: row.store_name
            }
        };

        // Commit transaction
        await client.query('COMMIT');

        // Send verification email
        await sendEmail({
            to: email,
            subject: t('verify_email_subject', lang),
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; text-align: justify; color: #5f6268;">
                    <div style="text-align: center; margin-bottom: 20px;">
                    <h2>${logoURL}</h2>
                    </div>

                    <p>${t('email_greeting', lang)}, <strong>${full_name}</strong></p>

                    <p>${t('verify_email_message', lang)}</p>

                    <div style="text-align: center; margin: 16px 0;">
                    <a href="${verificationLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        ${t('verify_email_button', lang)}
                    </a>
                    </div>

                    <p>${t('alternative_link_text', lang)}:</p>
                    <p style="text-align: left;">
                    <a href="${verificationLink}" style="color: #2563EB; text-decoration: underline;">${verificationLink}</a>
                    </p>

                    <p><strong>${t('note', lang)}:</strong> ${t('email_note', lang)}</p>

                    <p>${t('ignore_verify_note', lang)}.</p>

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

        const io = getIO();
        io.to(`store_${storeId}_Owner`).emit("userRegistered", {
            message: 'new_user_registered',
            user: optUser
        });
        io.to(`store_${storeId}_Manager`).emit("userRegistered", {
            message: 'new_user_registered',
            user: optUser
        });

        notifyStore({
            storeId,
            type: "new_user",
            title: "New user registered",
            message: `${full_name} registered and is awaiting access approval`,
            meta: { user_name: full_name, email },
            roles: ["Owner", "Manager"],
            excludeUserId: userId,
        }).catch(() => {});

        // Final response
        res.status(201).json({
            message: t('account_created', lang) + ', ' + t('verification_sent', lang),
            user: optUser
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Register error:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    } finally {
        client.release(); // Always release the client back to the pool
    }
};

// Resend Email
export const resendEmail = async (req, res) => {
    const { email } = req.body;
    const lang = req.headers['x-language'] || preferred_language || 'en';

    if (!email) {
        return res.status(400).json({ message: t('email_required', lang) });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Start transaction

        // Check if user already exists
        const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: t('email_not_registered', lang) });
        }

        const name = existingUser.rows[0].name;
        // Generate email verification token
        const token = crypto.randomBytes(32).toString('hex');
        const verificationLink = `${process.env.CLIENT_URL}/verify-email?key=${token}`;
        const logoURL = `${process.env.CLIENT_LOGO_URL}`;
        // const resetLink = `${process.env.CLIENT_URL}/new-password?token=${token}&email=${email}`;

        // Save token in DB
        await client.query(
            'INSERT INTO email_verification_tokens (email, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
            [email, token]
        );

        // Commit transaction
        await client.query('COMMIT');

        // Send verification email
        await sendEmail({
            to: email,
            subject: t('verify_email_subject', lang),
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; text-align: justify; color: #5f6268;">
                    <div style="text-align: center; margin-bottom: 20px;">
                    <h2>${logoURL}</h2>
                    </div>

                    <p>${t('email_greeting', lang)}, <strong>${name}</strong></p>

                    <p>${t('verify_email_message', lang)}</p>

                    <div style="text-align: center; margin: 16px 0;">
                    <a href="${verificationLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        ${t('verify_email_button', lang)}
                    </a>
                    </div>

                    <p>${t('alternative_link_text', lang)}:</p>
                    <p style="text-align: left;">
                    <a href="${verificationLink}" style="color: #2563EB; text-decoration: underline;">${verificationLink}</a>
                    </p>

                    <p><strong>${t('note', lang)}:</strong> ${t('email_note', lang)}</p>

                    <p>${t('ignore_verify_note', lang)}.</p>

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

        // Final response
        res.status(200).json({
            message: t('verification_sent', lang),
            user: name
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to send email:', err.message);
        res.status(500).json({ message: t('server_error', lang) });
    } finally {
        client.release(); // Always release the client back to the pool
    }
};

// Login user
export const login = async (req, res) => {
    const { email, password } = req.body;
    const lang = req.headers['x-language'] || 'en';
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const message = (en, sw) => lang === 'sw' ? sw : en;

    try {
        const userResult = await pool.query(
            `SELECT id, name, email, password, preferred_language, status, is_verified,
                    created_at, updated_at, avatar_url, failed_login_attempts,
                    account_locked_until, password_changed_at
             FROM users WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: t('user_not_found', lang) });
        }

        const user = userResult.rows[0];

        // Resolve the store first because security policies are configured per store.
        const storeRoleResult = await pool.query(`
            SELECT su.store_id, su.role_id, r.name as role_name, s.name as store_name
            FROM store_users su
            JOIN roles r ON su.role_id = r.id
            JOIN stores s ON su.store_id = s.id
            WHERE su.user_id = $1 AND su.status = true
            ORDER BY su.joined_at ASC NULLS LAST
            LIMIT 1
        `, [user.id]);

        let currentStoreRole = null;
        if (storeRoleResult.rows.length > 0) {
            const row = storeRoleResult.rows[0];
            currentStoreRole = {
                store_id: row.store_id,
                store_name: row.store_name,
                role_id: row.role_id,
                role_name: row.role_name
            };
        }

        const security = await getStoreSecurityPolicy(currentStoreRole?.store_id);
        const now = new Date();

        if (user.account_locked_until && new Date(user.account_locked_until) > now) {
            const remainingMinutes = Math.max(1, Math.ceil((new Date(user.account_locked_until) - now) / 60000));
            return res.status(423).json({
                code: 'ACCOUNT_TEMPORARILY_LOCKED',
                locked_until: user.account_locked_until,
                message: message(
                    `Account temporarily locked. Try again in ${remainingMinutes} minute(s).`,
                    `Akaunti imefungwa kwa muda. Jaribu tena baada ya dakika ${remainingMinutes}.`
                )
            });
        }

        // Clear an elapsed lock before evaluating a new login attempt.
        if (user.account_locked_until) {
            await pool.query(
                `UPDATE users SET account_locked_until = NULL, failed_login_attempts = 0 WHERE id = $1`,
                [user.id]
            );
            user.failed_login_attempts = 0;
        }

        const isMatch = await bcrypt.compare(password || '', user.password);
        if (!isMatch) {
            const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
            const shouldLock = nextAttempts >= security.loginAttempts;
            const lockedUntil = shouldLock
                ? new Date(Date.now() + security.accountLockMinutes * 60 * 1000)
                : null;

            await pool.query(
                `UPDATE users
                 SET failed_login_attempts = $1,
                     account_locked_until = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [shouldLock ? 0 : nextAttempts, lockedUntil, user.id]
            );

            if (security.auditLogging) {
                await pool.query(
                    `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        user.id,
                        shouldLock ? 'account_temporarily_locked' : 'login_failed',
                        JSON.stringify({ attempts: nextAttempts, maximum_attempts: security.loginAttempts, locked_until: lockedUntil }),
                        req.ip,
                        currentStoreRole?.store_id || null,
                    ]
                ).catch(() => {});
            }

            if (shouldLock) {
                return res.status(423).json({
                    code: 'ACCOUNT_TEMPORARILY_LOCKED',
                    locked_until: lockedUntil,
                    message: message(
                        `Too many failed attempts. Account locked for ${security.accountLockMinutes} minutes.`,
                        `Majaribio mengi yameshindwa. Akaunti imefungwa kwa dakika ${security.accountLockMinutes}.`
                    )
                });
            }

            const attemptsRemaining = Math.max(0, security.loginAttempts - nextAttempts);
            return res.status(400).json({
                code: 'INVALID_CREDENTIALS',
                attempts_remaining: attemptsRemaining,
                message: message(
                    `Invalid credentials. ${attemptsRemaining} attempt(s) remaining.`,
                    `Taarifa za kuingia si sahihi. Majaribio ${attemptsRemaining} yamebaki.`
                )
            });
        }

        if (!user.status) {
            return res.status(403).json({ message: t('account_disabled', lang) });
        }

        if (!user.is_verified) {
            return res.status(401).json({
                message: t('email_not_verified', lang),
                redirect: 'verify-email'
            });
        }

        const passwordChangeRequired = isPasswordExpired(user, security);

        const accessToken = jwt.sign({
            id: user.id,
            pwa: stampOf(user.password_changed_at),
            email: user.email,
            status: user.status,
            current_store_role: currentStoreRole,
            session_timeout_minutes: security.sessionTimeout,
            password_change_required: passwordChangeRequired,
        }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });

        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
            expiresIn: '7d'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        await pool.query(
            `UPDATE users
             SET failed_login_attempts = 0,
                 account_locked_until = NULL,
                 last_login_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [user.id]
        );

        if (security.auditLogging) {
            await pool.query(
                `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
                 VALUES ($1, 'login_success', $2, $3, $4)`,
                [user.id, JSON.stringify({ password_change_required: passwordChangeRequired }), req.ip, currentStoreRole?.store_id || null]
            ).catch(() => {});
        }

        let permissions = [];
        if (currentStoreRole?.store_id) {
            try {
                permissions = await getUserPermissions(user.id, currentStoreRole.store_id);
            } catch (permErr) {
                console.error('Login: failed to pre-load permissions', permErr.message);
            }
        }

        res.status(200).json({
            message: t('login_success', user.preferred_language || lang),
            token: accessToken,
            password_change_required: passwordChangeRequired,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                preferred_language: user.preferred_language,
                status: user.status,
                created_at: user.created_at,
                avatar_url: user.avatar_url,
                storeInfo: currentStoreRole,
                security: {
                    sessionTimeout: security.sessionTimeout,
                    passwordExpiry: security.passwordExpiry,
                },
                password_change_required: passwordChangeRequired,
            },
            permissions,
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: t('server_error', lang) });
    }
};

export const refreshToken = async (req, res) => {
    const token = req.cookies?.refreshToken;
    const lang = req.headers['x-language'] || 'en';

    if (!token) {
        return res.status(401).json({ message: t('missing_refresh_token', lang) });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const userResult = await pool.query(
            `SELECT id, email, status, created_at, updated_at, password_changed_at
             FROM users WHERE id = $1`,
            [decoded.id]
        );
        const user = userResult.rows[0];
        if (!user || !user.status) {
            return res.status(403).json({ message: t('account_disabled', lang) });
        }

        const storeRoleResult = await pool.query(`
            SELECT su.store_id, su.role_id, r.name as role_name, s.name as store_name
            FROM store_users su
            JOIN roles r ON su.role_id = r.id
            JOIN stores s ON su.store_id = s.id
            WHERE su.user_id = $1 AND su.status = true
            ORDER BY su.joined_at ASC NULLS LAST
            LIMIT 1
        `, [user.id]);
        const row = storeRoleResult.rows[0];
        const currentStoreRole = row ? {
            store_id: row.store_id,
            store_name: row.store_name,
            role_id: row.role_id,
            role_name: row.role_name,
        } : null;
        const security = await getStoreSecurityPolicy(currentStoreRole?.store_id);
        const passwordChangeRequired = isPasswordExpired(user, security);

        const newAccessToken = jwt.sign(
            {
                id: user.id,
                pwa: stampOf(user.password_changed_at),
                email: user.email,
                current_store_role: currentStoreRole,
                session_timeout_minutes: security.sessionTimeout,
                password_change_required: passwordChangeRequired,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            token: newAccessToken,
            password_change_required: passwordChangeRequired,
            security: { sessionTimeout: security.sessionTimeout, passwordExpiry: security.passwordExpiry },
        });
    } catch (err) {
        console.error('Refresh token error:', err.message);
        return res.status(401).json({ message: t('invalid_refresh_token', lang) });
    }
};

// Verify user password (for unlocking screen)
export const verifyPassword = async (req, res) => {
    const lang = req.user.lang;
    const { password } = req.body;
    const userId = req.user?.id;

    try {
        if (!userId) {
            return res.status(400).json({ message: t('unauthorized', lang) });
        }

        if (!password) {
            return res.status(400).json({ message: t('password_required', lang) });
        }

        const userResult = await pool.query(
            'SELECT id, password AS password_hash, status, preferred_language FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: t('user_not_found', lang) });
        }
        const user = userResult.rows[0];

        // Check if account is disabled
        if (!user.status) {
            return res.status(403).json({ message: t('account_disabled', lang) });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: t('invalid_password', lang) });
        }

        return res.status(200).json({ message: t('session_restored', user.preferred_language || lang) });
    } catch (err) {
        console.error('Verify password error:', err.message);
        return res
            .status(500)
            .json({ message: t('server_error', lang) });
    }
};

export const logout = (req, res) => {
    const lang = req.headers['x-language'] || 'en';

    // Clear the refresh token cookie by setting it expired
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });

    return res.status(200).json({ message: t('logout_success', lang) });
};

// Switch active store — returns the user's role/storeInfo for the target store + permissions
export const switchStore = async (req, res) => {
    const userId = req.user.id;
    const { store_id } = req.body;
    const lang = req.user.lang || req.headers['x-language'] || 'en';

    if (!store_id) {
        return res.status(400).json({ message: t('store_id_required', lang) });
    }

    try {
        // Verify the user is an active member of the requested store
        const storeRoleResult = await pool.query(
            `SELECT su.store_id, su.role_id, r.name AS role_name, s.name AS store_name
             FROM store_users su
             JOIN roles r ON r.id = su.role_id
             JOIN stores s ON s.id = su.store_id
             WHERE su.user_id = $1
               AND su.store_id = $2
               AND su.status = true`,
            [userId, store_id]
        );

        if (storeRoleResult.rows.length === 0) {
            return res.status(403).json({ message: t('not_part_of_store', lang) });
        }

        const row = storeRoleResult.rows[0];
        const storeInfo = {
            store_id: row.store_id,
            store_name: row.store_name,
            role_id: row.role_id,
            role_name: row.role_name
        };

        // Fetch permissions for this store so the client can update its cache
        let permissions = [];
        try {
            permissions = await getUserPermissions(userId, store_id);
        } catch (permErr) {
            console.error('switchStore: failed to fetch permissions', permErr.message);
        }

        const security = await getStoreSecurityPolicy(store_id);
        const passwordChangeRequired = Boolean(req.user.password_change_required);
        const token = jwt.sign(
            {
                id: userId,
                pwa: await passwordStamp(userId),
                email: req.user.email,
                status: req.user.status,
                current_store_role: storeInfo,
                session_timeout_minutes: security.sessionTimeout,
                password_change_required: passwordChangeRequired,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' },
        );

        return res.status(200).json({
            storeInfo,
            permissions,
            token,
            security: {
                sessionTimeout: security.sessionTimeout,
                passwordExpiry: security.passwordExpiry,
            },
        });
    } catch (err) {
        console.error('Switch store error:', err.message);
        return res.status(500).json({ message: t('server_error', lang) });
    }
};

