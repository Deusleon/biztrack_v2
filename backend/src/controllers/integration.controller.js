import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
import { t } from '../utils/translate.js';
import * as beemAfrica from '../utils/smsGateways/beemAfrica.js';
import * as nextSMS from '../utils/smsGateways/nextSMS.js';
import * as meseji from '../utils/smsGateways/meseji.js';
const GATEWAYS = {
  beem_africa: beemAfrica,
  next_sms: nextSMS,
  meseji: meseji,
};
const BACKUP_PROVIDERS = new Set(['cloud_backup', 'google_drive']);
const SUPPORTED_PROVIDERS = new Set([...Object.keys(GATEWAYS), ...BACKUP_PROVIDERS]);
import { notifyStore } from '../services/notification.service.js';
// Fields that must be masked when returning config to the frontend
const SENSITIVE_KEYS = ["secret_key", "password", "api_key", "client_secret", "refresh_token", "token"];

function maskConfig(config) {
  const masked = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (masked[key]) {
      masked[key] = "••••••••";
    }
  }
  return masked;
}

// GET /api/integrations/access
// Reaching this handler means developerOnly already let the user through.
export const checkAccess = async (req, res) => {
  return res.status(200).json({ success: true, allowed: true });
};

// GET /api/integrations
// Returns all SMS integrations with masked credentials
export const getIntegrations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, provider, type, config, is_active, created_at, updated_at FROM integrations WHERE type IN ('sms', 'backup') ORDER BY type, provider"
    );

    const integrations = result.rows.map((row) => ({
      ...row,
      config: maskConfig(row.config),
    }));

    return res.status(200).json({ integrations });
  } catch (err) {
    console.error("Get integrations error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// PUT /api/integrations/:provider
// Save or update credentials for a gateway
export const saveIntegration = async (req, res) => {
  const lang = req.user?.lang || req.headers["x-language"] || "en";
  const { provider } = req.params;
  const { config } = req.body;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ message: t("invalid_gateway_provider", lang) });
  }

  if (!config || typeof config !== "object") {
    return res.status(400).json({ message: t("validation_failed", lang) });
  }

  try {
    // Fetch existing config so we can preserve existing sensitive values
    // when the frontend sends back the masked placeholder "••••••••"
    const existing = await pool.query(
      "SELECT config FROM integrations WHERE provider = $1 LIMIT 1",
      [provider]
    );

    const existingConfig = existing.rows.length > 0 ? existing.rows[0].config : {};

    // Merge: only overwrite sensitive fields when the incoming value is NOT the mask
    const mergedConfig = { ...existingConfig, ...config };
    for (const key of SENSITIVE_KEYS) {
      if (config[key] === "••••••••") {
        mergedConfig[key] = existingConfig[key] ?? "";
      }
    }

    // NextSMS now authenticates with username + password. Drop the legacy
    // API token so it is not kept around in the database.
    if (provider === "next_sms") {
      delete mergedConfig.token;
    }

    await pool.query(
      `INSERT INTO integrations (provider, type, config, is_active, updated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (provider, type)
       DO UPDATE SET config = $3, is_active = true, updated_at = NOW()`,
      [provider, BACKUP_PROVIDERS.has(provider) ? 'backup' : 'sms', mergedConfig]
    );

    return res.status(200).json({ message: t("integration_saved", lang) });
  } catch (err) {
    console.error("Save integration error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/integrations/:provider/verify
// Checks the credentials against the provider WITHOUT sending an SMS or using
// credit. Body: { config? } -- the (possibly unsaved) form values. Masked
// placeholders and empty sensitive fields fall back to the saved values.
export const verifyIntegration = async (req, res) => {
  const lang = req.user?.lang || req.headers["x-language"] || "en";
  const { provider } = req.params;

  if (!GATEWAYS[provider] || typeof GATEWAYS[provider].verifyCredentials !== "function") {
    return res.status(400).json({ message: t("invalid_gateway_provider", lang) });
  }

  try {
    const saved = await pool.query(
      "SELECT config FROM integrations WHERE provider = $1 AND type = 'sms' LIMIT 1",
      [provider]
    );
    const savedConfig = saved.rows[0]?.config || {};
    const incoming = req.body?.config && typeof req.body.config === "object" ? req.body.config : null;

    let config = savedConfig;
    if (incoming) {
      config = { ...savedConfig, ...incoming };
      for (const key of SENSITIVE_KEYS) {
        if (incoming[key] === "••••••••" || incoming[key] === "") {
          config[key] = savedConfig[key] ?? "";
        }
      }
    }

    if (!config || Object.keys(config).length === 0) {
      return res.status(400).json({ message: t("gateway_not_configured", lang) });
    }

    const result = await GATEWAYS[provider].verifyCredentials(config);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: t("connection_test_success", lang),
        data: result.data || {},
      });
    }
    return res.status(400).json({
      success: false,
      message: result.error || t("connection_test_failed", lang),
    });
  } catch (err) {
    console.error("Verify integration error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/integrations/:provider/test
// Send a test SMS using the specified gateway
export const testIntegration = async (req, res) => {
  const lang = req.user?.lang || req.headers["x-language"] || "en";
  const { provider } = req.params;
  const { phone } = req.body;

  if (!GATEWAYS[provider]) {
    return res.status(400).json({ message: t("invalid_gateway_provider", lang) });
  }

  if (!phone) {
    return res.status(400).json({ message: t("phone_required_for_test", lang) });
  }

  try {
    const intRes = await pool.query(
      "SELECT config FROM integrations WHERE provider = $1 AND type = 'sms' LIMIT 1",
      [provider]
    );

    if (!intRes.rows.length || !intRes.rows[0].config || Object.keys(intRes.rows[0].config).length === 0) {
      return res.status(400).json({ message: t("gateway_not_configured", lang) });
    }

    const config = intRes.rows[0].config;
    const result = await GATEWAYS[provider].sendSms(config, phone, "BizTrack test message. Gateway is working correctly.");

    if (result.success) {
      return res.status(200).json({ message: t("test_sms_sent_successfully", lang), data: result.data });
    } else {
      return res.status(400).json({ message: result.error || t("test_sms_failed", lang) });
    }
  } catch (err) {
    console.error("Test integration error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};


// POST /api/integrations/cloud_backup/run
export const runCloudBackup = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  try {
    const cfgRes = await pool.query(
      "SELECT config FROM integrations WHERE provider = 'cloud_backup' AND type = 'backup' AND is_active = true LIMIT 1"
    );
    const webhookUrl = cfgRes.rows[0]?.config?.webhook_url;
    if (!webhookUrl) return res.status(400).json({ message: 'Cloud backup is not configured' });

    const tablesRes = await pool.query(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='store_id' ORDER BY table_name`);
    const data = {};
    for (const { table_name } of tablesRes.rows) {
      const rows = await pool.query(`SELECT * FROM "${table_name}" WHERE store_id = $1`, [storeId]);
      data[table_name] = rows.rows;
    }
    const payload = {
      app: 'BizTrack', storeId, createdAt: new Date().toISOString(),
      format: 'biztrack-json-v1', data,
    };
    const response = await fetch(webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Backup destination returned ${response.status}`);
    await pool.query(`INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)`, [userId, 'cloud_backup_completed', JSON.stringify({ tables: Object.keys(data).length }), storeId]);
    notifyStore({
      storeId,
      type: 'cloud_backup',
      title: 'Cloud backup completed',
      message: 'Store data was backed up successfully',
      meta: { tables: Object.keys(data).length, created_at: payload.createdAt },
      roles: ['Owner', 'Manager'],
    }).catch(() => {});
    return res.status(200).json({ message: 'Cloud backup completed', tables: Object.keys(data).length, createdAt: payload.createdAt });
  } catch (err) {
    console.error('Cloud backup error:', err);
    return res.status(500).json({ message: err.message || 'Cloud backup failed' });
  }
};

