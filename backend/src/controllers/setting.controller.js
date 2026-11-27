import pool from '../config/db.js';
import { isDeveloper } from '../middlewares/developerOnly.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import * as _n11 from 'bcryptjs';
const bcrypt = _n11.default ?? _n11;
import cloudinary from '../utils/cloudinaryConfig.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../services/notification.service.js';
import { runNotificationsForStoreNow } from '../services/notificationScheduler.js';
import { invalidateStoreSecurityPolicy } from '../utils/securityPolicy.js';
import { cache } from '../utils/cache.js';
// Get store settings from the database
export const getStoreSettings = async (req, res) => {
  const lang = req.user.lang || req.headers["x-language"] || "en";
  const storeId = req.user.current_store_id;

  try {
    // Fetch system settings
    const systemSettingsResult = await pool.query(
      "SELECT settings FROM system_settings LIMIT 1"
    );

    const systemSettings = systemSettingsResult.rows[0].settings;

    const storeSettingsResult = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    const storeSettings = storeSettingsResult.rows[0].settings;
    for (const section of storeSettings?.systemOptions || []) {
      for (const field of section.fields || []) {
        if (field.key === 'defaultReceiptSize' && Array.isArray(field.options) && !field.options.some((o) => o.value === 'A4')) {
          field.options.push({ label: 'size_a4', value: 'A4' });
        }
      }
    }

    return res
      .status(200)
      .json({ systemSettings: systemSettings, storeSettings: storeSettings });
  } catch (err) {
    console.error("Failed to fetch system & Store settings:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

const SECURITY_LABELS = {
  sessionTimeout: "security_session_timeout",
  loginAttempts: "security_login_attempts",
  passwordExpiry: "security_password_expiry",
  accountLockMinutes: "security_account_lock",
  auditLogging: "security_audit_logging",
  dataEncryption: "security_data_encryption",
};

function labelsFrom(settings) {
  const map = {};
  for (const section of settings?.systemOptions || []) {
    for (const field of section.fields || []) {
      if (field?.key && field?.label) map[field.key] = field.label;
    }
  }
  return map;
}

function fieldLabel(key, labels) {
  const leaf = String(key).split(".").pop();
  if (labels[leaf]) return labels[leaf];
  if (SECURITY_LABELS[leaf]) return SECURITY_LABELS[leaf];
  return leaf.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if ((a == null || a === "") && (b == null || b === "")) return true;
  if (a == null || b == null) return false;
  if (isPlainObject(a) || isPlainObject(b) || Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  const left = Number(a);
  const right = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(left) && !Number.isNaN(right) && left === right) return true;
  return String(a) === String(b);
}

// Leaf fields whose saved value differs. Nested groups (security, and so on) are opened
// so the log lists "Session timeout" rather than one blob of every setting.
function collectSettingChanges(before, after, out) {
  const walk = (prev, next, prefix) => {
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
    for (const key of keys) {
      if (/password|secret|token|api_?key|private_?key/i.test(key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const left = prev?.[key];
      const right = next?.[key];
      if (isPlainObject(left) || isPlainObject(right)) walk(left || {}, right || {}, path);
      else if (!valuesEqual(left, right)) out.push({ key: path, before: left ?? null, after: right ?? null });
    }
  };
  walk(before || {}, after || {}, "");
  return out;
}

async function readableSettingValue(key, value) {
  if (value == null || value === "") return value ?? null;
  const leaf = String(key).split(".").pop();
  try {
    if (leaf === "defaultStore") {
      const found = await pool.query("SELECT name FROM stores WHERE id::text = $1", [String(value)]);
      return found.rows[0]?.name || value;
    }
    if (leaf === "defaultPriceCategory") {
      const found = await pool.query("SELECT name FROM price_categories WHERE id::text = $1", [String(value)]);
      return found.rows[0]?.name || value;
    }
  } catch {
    return value;
  }
  return value;
}

// Update store settings
export const updateStoreSettings = async (req, res) => {
  const { id } = req.params; // storeId
  let operations = req.body.operations || {}; 
  let systemDefaults = req.body.systemDefaults || {};
  const businessInfo = req.body.businessInfo || null;
  const lang = req.user.lang || req.headers["x-language"] || "en";
  const userId = req.user.id;
  const keysToMove = [
    "defaultStore",
    "multiStoreSupport",
    "interStoreTransfer",
    "defaultSmsGateway",
    "defaultPdfDesign",
  ];
  keysToMove.forEach((key) => {
    if (operations.hasOwnProperty(key)) {
      systemDefaults = systemDefaults || {};
      systemDefaults[key] = operations[key];
      delete operations[key]; // remove from operations
    }
  });
  // The default SMS gateway can only be changed by the developer account
  // (DEVELOPER_EMAIL). For anyone else the submitted value is ignored and the
  // saved one is kept (see below).
  const canChangeDeveloperSettings = isDeveloper(req.user);
  const VALID_SMS_GATEWAYS = ["", "beem_africa", "next_sms", "meseji", "swala_sms"];
  const VALID_PDF_DESIGNS = ["1", "2", "3"];
  if (!canChangeDeveloperSettings) {
    delete systemDefaults.defaultSmsGateway;
    delete systemDefaults.defaultPdfDesign;
  } else if (
    systemDefaults.defaultSmsGateway !== undefined &&
    !VALID_SMS_GATEWAYS.includes(systemDefaults.defaultSmsGateway)
  ) {
    return res.status(400).json({ message: t("invalid_gateway_provider", lang) });
  } else if (
    systemDefaults.defaultPdfDesign !== undefined &&
    systemDefaults.defaultPdfDesign !== "" &&
    !VALID_PDF_DESIGNS.includes(String(systemDefaults.defaultPdfDesign))
  ) {
    return res.status(400).json({ message: t("invalid_pdf_design", lang) });
  }
  // systemDefaults.defaultStore = operations.defaultStore;
  // systemDefaults.multiStoreSupport = operations.multiStoreSupport;
  // systemDefaults.interStoreTransfer = operations.interStoreTransfer;

  try {
    // 1. Validate store ownership
    const store = await pool.query("SELECT * FROM stores WHERE id = $1", [id]);

    if (store.rows.length === 0) {
      return res.status(404).json({ message: t("store_not_found", lang) });
    }

    const storeUserRes = await pool.query(
      `SELECT su.*, r.name AS role_name
   FROM store_users su
   JOIN roles r ON r.id = su.role_id
   WHERE su.user_id = $1 AND su.store_id = $2
   LIMIT 1`,
      [userId, id]
    );

    if (storeUserRes.rows.length === 0) {
      throw new Error("Access denied, user not assigned to this store.");
    }

    const storeUser = storeUserRes.rows[0];
    const userRole = storeUserRes.rows[0].role_name;

    const allowedRoles = ["Owner", "Manager"];

    if (!allowedRoles.includes(userRole)) {
      throw new Error("Access denied, insufficient permissions.");
    }

    // 2. Fetch store_settings if exists
    const storeSettingsRes = await pool.query(
      "SELECT * FROM store_settings WHERE store_id = $1",
      [id]
    );

    const existingStoreSettings =
      storeSettingsRes.rows.length > 0 ? storeSettingsRes.rows[0].settings : {};

    // Merge old + new values (do not overwrite entire JSON)
    const updatedStoreSettings = {
      ...existingStoreSettings,
      operations: {
        ...existingStoreSettings.operations,
        ...operations,
      },
    };

    let finalStoreSettings;
    let previousSystem = null;
    let nextSystem = null;

    // UPDATE existing
    finalStoreSettings = await pool.query(
      `UPDATE store_settings 
         SET settings = $1, updated_at = NOW()
         WHERE store_id = $2
         RETURNING *`,
      [updatedStoreSettings, id]
    );
    
    cache.del(`store_settings:${id}`);

    // 3️⃣ If store is primary → Save business info to system_settings
    if (operations.isPrimaryStore === true) {
      // Fetch existing system settings
      const sysSettingsRes = await pool.query(
        "SELECT * FROM system_settings LIMIT 1"
      );
      const systemSettingsId = sysSettingsRes.rows[0].id;

      const existingSysSettings =
        sysSettingsRes.rows.length > 0 ? sysSettingsRes.rows[0].settings : {};
      previousSystem = existingSysSettings;

      // Never lose the saved default SMS gateway: it is only replaced when the
      // developer account explicitly sends a new value.
      let nextSystemDefaults = systemDefaults || existingSysSettings.systemDefaults;
      for (const key of ["defaultSmsGateway", "defaultPdfDesign"]) {
        const saved = existingSysSettings.systemDefaults?.[key];
        if (nextSystemDefaults && nextSystemDefaults[key] === undefined && saved !== undefined) {
          nextSystemDefaults = { ...nextSystemDefaults, [key]: saved };
        }
      }

      const updatedSysSettings = {
        ...existingSysSettings,
        businessInfo: businessInfo || existingSysSettings.businessInfo,
        systemDefaults: nextSystemDefaults,
      };
      nextSystem = updatedSysSettings;

      // UPDATE system_settings
      await pool.query(
        `UPDATE system_settings SET settings = $1, updated_at = NOW()`,
        [updatedSysSettings]
      );
    }

    // 4️⃣ Log only the fields whose saved value actually changed.
    const labels = { ...labelsFrom(existingStoreSettings), ...labelsFrom(previousSystem || {}) };
    const rawChanges = [];
    collectSettingChanges(existingStoreSettings.operations || {}, updatedStoreSettings.operations || {}, rawChanges);
    if (previousSystem && nextSystem) {
      collectSettingChanges(previousSystem.businessInfo || {}, nextSystem.businessInfo || {}, rawChanges);
      collectSettingChanges(previousSystem.systemDefaults || {}, nextSystem.systemDefaults || {}, rawChanges);
    }
    const fields = [];
    for (const change of rawChanges) {
      fields.push({
        field: fieldLabel(change.key, labels),
        before: await readableSettingValue(change.key, change.before),
        after: await readableSettingValue(change.key, change.after),
      });
    }
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "update_store_settings",
        JSON.stringify({
          changes: [{ op: "update", label: "settings", fields }],
        }),
        req.ip || null,
        id,
      ]
    );

    // 5️⃣ Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("storeSettingsUpdated", {
      message: t("settings_updated", lang),
      settings: finalStoreSettings.rows[0],
    });

    if (operations.security) {
      invalidateStoreSecurityPolicy(id);
      io.to(`store_${id}`).emit("storeSecurityUpdated", {
        security: updatedStoreSettings.operations.security,
      });
    }

    return res.status(200).json({
      message: t("settings_updated", lang),
      settings: finalStoreSettings.rows[0],
    });
  } catch (err) {
    console.error("Update store settings error:", err);
    return res.status(500).json({ message: t("server_error", lang) });
  }
};

// ─── GET /api/settings/notifications ─────────────────────────────────────────
export const getNotificationSettings = async (req, res) => {
  const storeId = req.user.current_store_id;
  const lang = req.headers["x-language"] || req.user.preferred_language || "en";

  try {
    const result = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ notifications: getDefaultNotifications() });
    }

    const notifications = { ...getDefaultNotifications(), ...(result.rows[0].settings?.notifications || {}) };
    return res.status(200).json({ notifications });
  } catch (err) {
    console.error("Get notification settings error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── PUT /api/settings/notifications ─────────────────────────────────────────
export const updateNotificationSettings = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = req.headers["x-language"] || req.user.preferred_language || "en";
  const { notifications } = req.body;

  if (!notifications || typeof notifications !== "object") {
    return res.status(400).json({ message: t("invalid_notification_settings", lang) });
  }

  try {
    const existing = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    const currentSettings = existing.rows[0]?.settings || {};
    const updatedSettings = {
      ...currentSettings,
      notifications: { ...getDefaultNotifications(), ...notifications },
    };

    await pool.query(
      `UPDATE store_settings SET settings = $1, updated_at = NOW() WHERE store_id = $2`,
      [updatedSettings, storeId]
    );

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, "update_notifications", "Notification settings updated", storeId]
    );

    return res.status(200).json({
      message: t("settings_updated", lang),
      notifications: updatedSettings.notifications,
    });
  } catch (err) {
    console.error("Update notification settings error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── POST /api/settings/notifications/test-run ───────────────────────────────
// Manually triggers the scheduled notification checks (low stock, payment
// due, daily summary) for the CURRENT store only, right now -- for testing.
// This sends REAL notifications through whatever channels are enabled in
// the store's settings; it is not a dry run/preview.
//
// { force: true } also clears today's "already sent" markers first, so you
// can trigger it again without waiting for tomorrow.
export const testRunNotifications = async (req, res) => {
  const storeId = req.user.current_store_id;
  const lang = req.user.lang || req.headers["x-language"] || "en";
  const force = req.body?.force === true;

  try {
    const result = await runNotificationsForStoreNow(storeId, { force });
    return res.status(200).json({
      message: t("notification_test_run_complete", lang) || "Notification check run for your store.",
      ...result,
    });
  } catch (err) {
    console.error("Test run notifications error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

function getDefaultNotifications() {
  return { ...DEFAULT_NOTIFICATION_SETTINGS };
}

// ─── POST /api/settings/branding/upload ───────────────────────────────────────
export const uploadBrandingAsset = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const { asset_type } = req.body; // "logo" | "receipt_header" | "favicon"
  const lang = req.headers["x-language"] || req.user.preferred_language || "en";

  const validTypes = ["logo", "receipt_header", "favicon"];
  if (!validTypes.includes(asset_type)) {
    return res.status(400).json({ message: t("invalid_asset_type", lang) });
  }

  if (!req.file) {
    return res.status(400).json({ message: t("no_file_uploaded", lang) });
  }

  try {
    // Get existing branding to delete old asset
    const existing = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    const currentSettings = existing.rows[0]?.settings || {};
    const currentBranding = currentSettings.branding || {};
    const oldPublicId = currentBranding[`${asset_type}_public_id`];

    // Delete old asset from Cloudinary
    if (oldPublicId) {
      await cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    // Upload new asset to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `biztrack/branding/${storeId}`, resource_type: "image" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Update store_settings.branding
    const updatedBranding = {
      ...currentBranding,
      [asset_type]: uploadResult.secure_url,
      [`${asset_type}_public_id`]: uploadResult.public_id,
    };

    await pool.query(
      `UPDATE store_settings SET settings = jsonb_set(settings, '{branding}', $1::jsonb), updated_at = NOW()
       WHERE store_id = $2`,
      [JSON.stringify(updatedBranding), storeId]
    );

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, "upload_branding", `Uploaded ${asset_type} branding asset`, storeId]
    );

    return res.status(200).json({
      message: t("asset_uploaded", lang),
      url: uploadResult.secure_url,
      asset_type,
    });
  } catch (err) {
    console.error("Upload branding asset error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── DELETE /api/settings/branding/:assetType ─────────────────────────────────
export const removeBrandingAsset = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const { asset_type } = req.params;
  const lang = req.headers["x-language"] || req.user.preferred_language || "en";

  const validTypes = ["logo", "receipt_header", "favicon"];
  if (!validTypes.includes(asset_type)) {
    return res.status(400).json({ message: t("invalid_asset_type", lang) });
  }

  try {
    const existing = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    const currentSettings = existing.rows[0]?.settings || {};
    const currentBranding = currentSettings.branding || {};
    const oldPublicId = currentBranding[`${asset_type}_public_id`];

    if (oldPublicId) {
      await cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    const updatedBranding = { ...currentBranding };
    delete updatedBranding[asset_type];
    delete updatedBranding[`${asset_type}_public_id`];

    await pool.query(
      `UPDATE store_settings SET settings = jsonb_set(settings, '{branding}', $1::jsonb), updated_at = NOW()
       WHERE store_id = $2`,
      [JSON.stringify(updatedBranding), storeId]
    );

    return res.status(200).json({ message: t("asset_removed", lang), asset_type });
  } catch (err) {
    console.error("Remove branding asset error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── GET /api/settings/branding ───────────────────────────────────────────────
export const getBrandingAssets = async (req, res) => {
  const storeId = req.user.current_store_id;

  try {
    const result = await pool.query(
      "SELECT settings->>'branding' AS branding FROM store_settings WHERE store_id = $1",
      [storeId]
    );

    const branding = result.rows[0]?.branding ? JSON.parse(result.rows[0].branding) : {};

    return res.status(200).json({ branding });
  } catch (err) {
    console.error("Get branding assets error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// The theme lives in the browser. Remember the last chosen primary so emailed PDFs use the same colour.
export const updatePdfTheme = async (req, res) => {
  const hex = String(req.body?.primary || "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ message: "Choose a theme colour" });
  }
  try {
    const sys = await pool.query("SELECT id, settings FROM system_settings LIMIT 1");
    if (!sys.rows[0]) return res.status(404).json({ message: "Settings not found" });
    const settings = sys.rows[0].settings || {};
    const next = {
      ...settings,
      systemDefaults: { ...(settings.systemDefaults || {}), themePrimary: hex },
    };
    await pool.query(
      "UPDATE system_settings SET settings = $1, updated_at = NOW() WHERE id = $2",
      [next, sys.rows[0].id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update PDF theme error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

