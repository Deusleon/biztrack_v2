import pool from '../config/db.js';
import * as beemAfrica from './smsGateways/beemAfrica.js';
import * as nextSMS from './smsGateways/nextSMS.js';
import * as meseji from './smsGateways/meseji.js';
import * as swalaSms from './smsGateways/swalaSms.js';
const GATEWAYS = {
  beem_africa: beemAfrica,
  next_sms: nextSMS,
  meseji: meseji,
  swala_sms: swalaSms,
};

async function send(to, message, context = {}) {
  try {
    const sysRes = await pool.query("SELECT settings FROM system_settings LIMIT 1");
    const defaultGateway = sysRes.rows[0]?.settings?.systemDefaults?.defaultSmsGateway || null;

    const integrationsRes = await pool.query(
      "SELECT provider, config FROM integrations WHERE type = 'sms' AND is_active = true"
    );

    if (integrationsRes.rows.length === 0) {
      await logSmsAttempt({ gateway: "none", to, message, success: false, error: "No active SMS gateway is configured.", context });
      return { success: false, error: "No active SMS gateway is configured." };
    }

    // Default gateway first (if it's actually configured+active), then
    // whatever else is available, so a single provider outage doesn't
    // stop messages from going out.
    const ordered = [...integrationsRes.rows].sort((a, b) => {
      if (a.provider === defaultGateway) return -1;
      if (b.provider === defaultGateway) return 1;
      return 0;
    });

    const attempts = [];

    for (const row of ordered) {
      const gatewayKey = row.provider;
      if (!GATEWAYS[gatewayKey]) {
        attempts.push({ gateway: gatewayKey, error: `Unknown gateway: ${gatewayKey}` });
        continue;
      }

      const result = await GATEWAYS[gatewayKey].sendSms(row.config, to, message);
      attempts.push({ gateway: gatewayKey, success: result.success, error: result.error });

      if (result.success) {
        await logSmsAttempt({ gateway: gatewayKey, to, message, success: true, context });
        return { ...result, gateway: gatewayKey, attempts };
      }

      console.error(`SMS gateway '${gatewayKey}' failed, trying next if available:`, result.error);
    }

    const lastError = attempts[attempts.length - 1]?.error || "All configured SMS gateways failed.";
    await logSmsAttempt({
      gateway: attempts[attempts.length - 1]?.gateway || "unknown",
      to,
      message,
      success: false,
      error: lastError,
      context,
    });

    return { success: false, error: "All configured SMS gateways failed.", attempts };
  } catch (err) {
    console.error("SMS service error:", err);
    return { success: false, error: err.message };
  }
}

async function logSmsAttempt({ gateway, to, message, success, error, context = {} }) {
  try {
    await pool.query(
      `INSERT INTO sms_logs (store_id, user_id, gateway, recipient, message, status, error, batch_id, group_id, group_name, recipient_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        context.storeId || null,
        context.userId || null,
        gateway,
        String(to),
        message,
        success ? "sent" : "failed",
        error || null,
        context.batchId || null,
        context.groupId || null,
        context.groupName || null,
        context.recipientName || null,
      ]
    );
  } catch (logErr) {
    // Never let logging failures break the actual SMS send flow.
    console.error("Failed to write sms_logs row:", logErr.message);
  }
}

export { send, GATEWAYS };

