import pool from '../config/db.js';
import { passwordStamp } from '../utils/passwordStamp.js';
import { invalidateUserRow } from '../utils/accessCache.js';
import { logActivity } from '../utils/activityLog.js';
import * as _n5 from 'bcryptjs';
const bcrypt = _n5.default ?? _n5;
import * as _n6 from 'jsonwebtoken';
const jwt = _n6.default ?? _n6;
import cloudinary from '../utils/cloudinaryConfig.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getStoreSecurityPolicy } from '../utils/securityPolicy.js';
import { notifyStore } from '../services/notification.service.js';
// ─── GET /api/profile ─────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, preferred_language, avatar_url, status, is_verified, created_at, updated_at, last_login_at, password_changed_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return respondWithError(req, res, 404, "user_not_found");
    }

    return res.status(200).json({ profile: result.rows[0] });
  } catch (err) {
    console.error("Get profile error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── PUT /api/profile ─────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const { name, email, phone, preferred_language } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: t("name_and_email_required", lang) });
  }

  try {
    // Check if new email is already taken by another user
    if (email !== req.user.email) {
      const existing = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, userId]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: t("email_exists", lang) });
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET name = $1, email = $2, phone = $3, preferred_language = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, phone, preferred_language, avatar_url, status, created_at`,
      [name.trim(), email.trim().toLowerCase(), phone || null, preferred_language || "en", userId]
    );

    await logActivity(pool, {
      userId: userId,
      storeId: req.user.current_store_id || null,
      action: "update_profile",
      description: {
        name,
        email,
        phone: phone || undefined,
        preferred_language: preferred_language || undefined,
      },
      ip: req.ip,
    });
    
    return res.status(200).json({
      message: t("profile_updated", lang),
      profile: result.rows[0],
    });
  } catch (err) {
    console.error("Update profile error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── PUT /api/profile/password ────────────────────────────────────────────────
export const changePassword = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ message: t("all_fields_required", lang) });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ message: t("password_too_short_8", lang) });
  }

  try {
    const userRes = await pool.query("SELECT password FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return respondWithError(req, res, 404, "user_not_found");
    }

    const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: t("current_password_incorrect", lang) });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    await pool.query(
      `UPDATE users
       SET password = $1,
           password_changed_at = NOW(),
           failed_login_attempts = 0,
           account_locked_until = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    // Log the action
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, "change_password", "User changed their password", req.user.current_store_id]
    );

    notifyStore({
      storeId: req.user.current_store_id,
      type: "user_activity",
      title: "Password changed",
      message: "A user changed their account password",
      meta: { user_id: userId, email: req.user.email },
      roles: ["Owner", "Manager"],
    }).catch(() => {});

    const security = await getStoreSecurityPolicy(req.user.current_store_id);
    const currentStoreRole = req.user.current_store_role || null;
    invalidateUserRow(userId);   // the next request must see the new password stamp, not a cached copy
    const token = jwt.sign(
      {
        id: userId,
        pwa: await passwordStamp(userId),
        email: req.user.email,
        status: req.user.status,
        current_store_role: currentStoreRole,
        session_timeout_minutes: security.sessionTimeout,
        password_change_required: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      message: t("password_changed", lang),
      token,
      password_change_required: false,
      security: {
        sessionTimeout: security.sessionTimeout,
        passwordExpiry: security.passwordExpiry,
      },
    });
  } catch (err) {
    console.error("Change password error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── POST /api/profile/avatar ─────────────────────────────────────────────────
// Accepts { avatar_url, public_id } — frontend uploads to Cloudinary directly,
// then sends us the resulting URL and public_id for storage and future cleanup.
export const uploadAvatar = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const { avatar_url, public_id } = req.body;

  if (!avatar_url || typeof avatar_url !== "string") {
    return res.status(400).json({ message: t("no_file_uploaded", lang) });
  }

  // Basic URL validation – must be a valid https:// URL
  try { new URL(avatar_url); } catch {
    return res.status(400).json({ message: "Invalid avatar URL" });
  }

  try {
    // Delete old Cloudinary asset if one was tracked
    const existing = await pool.query(
      "SELECT avatar_public_id FROM users WHERE id = $1",
      [userId]
    );
    const oldPublicId = existing.rows[0]?.avatar_public_id;
    if (oldPublicId && oldPublicId !== public_id) {
      cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    await pool.query(
      "UPDATE users SET avatar_url = $1, avatar_public_id = $2, updated_at = NOW() WHERE id = $3",
      [avatar_url, public_id || null, userId]
    );

    await logActivity(pool, {
      userId: userId,
      storeId: req.user.current_store_id || null,
      action: "upload_avatar",
      description: {
      },
      ip: req.ip,
    });
    
    return res.status(200).json({
      message: t("avatar_updated", lang),
      avatar_url,
    });
  } catch (err) {
    console.error("Upload avatar error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── DELETE /api/profile/avatar ───────────────────────────────────────────────
export const removeAvatar = async (req, res) => {
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  try {
    const existing = await pool.query(
      "SELECT avatar_public_id FROM users WHERE id = $1",
      [userId]
    );

    // Delete the asset from Cloudinary if we have the public_id
    const oldPublicId = existing.rows[0]?.avatar_public_id;
    if (oldPublicId) {
      cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    await pool.query(
      "UPDATE users SET avatar_url = NULL, avatar_public_id = NULL, updated_at = NOW() WHERE id = $1",
      [userId]
    );

    await logActivity(pool, {
      userId: userId,
      storeId: req.user.current_store_id || null,
      action: "remove_avatar",
      description: {
      },
      ip: req.ip,
    });
    
    return res.status(200).json({ message: t("avatar_removed", lang) });
  } catch (err) {
    console.error("Remove avatar error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

