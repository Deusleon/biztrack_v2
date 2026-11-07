// path: backend/controllers/messaging.controller.js
import crypto from 'crypto';
import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
import * as beemAfrica from '../utils/smsGateways/beemAfrica.js';
import * as nextSMS from '../utils/smsGateways/nextSMS.js';
import * as meseji from '../utils/smsGateways/meseji.js';
import * as smsService from '../utils/smsService.js';
import { t } from '../utils/translate.js';
import sendEmail from '../utils/emailService.js';
import { buildEmailHtml } from '../services/notification.service.js';
import { TtlCache } from '../utils/ttlCache.js';
import { isDeveloper, getDeveloperEmails } from '../middlewares/developerOnly.js';
import { getSupportAdminEmails } from '../middlewares/supportAdmin.js';
const GATEWAYS = {
  beem_africa: beemAfrica,
  next_sms: nextSMS,
  meseji: meseji,
};

const GATEWAY_LABELS = {
  beem_africa: "Beem Africa",
  next_sms: "NextSMS",
  meseji: "Meseji",
};

/**
 * Resolves whichever SMS gateway is currently set as the system default
 * (Settings > Configuration > Default SMS Gateway), along with its saved
 * credentials. Account stats, Sender IDs, and Top-up are all specific to
 * ONE provider's dashboard -- there's no "combined" version of these, so
 * they always reflect whichever gateway is set as default right now.
 * (Message History is the one exception -- see getMessageHistory below,
 * which reads from our own local log instead.)
 */
async function getActiveGateway() {
  const sysRes = await pool.query("SELECT settings FROM system_settings LIMIT 1");
  const gatewayKey = sysRes.rows[0]?.settings?.systemDefaults?.defaultSmsGateway || null;

  if (!gatewayKey) {
    return { gatewayKey: null, gatewayModule: null, config: null };
  }

  const intRes = await pool.query(
    "SELECT config FROM integrations WHERE provider = $1 AND type = 'sms' AND is_active = true LIMIT 1",
    [gatewayKey]
  );

  return {
    gatewayKey,
    gatewayModule: GATEWAYS[gatewayKey] || null,
    config: intRes.rows[0]?.config || null,
  };
}

function gatewayLabel(key) {
  return GATEWAY_LABELS[key] || key;
}

/**
 * Shared guard for every endpoint below that is provider-specific
 * (account stats, sender IDs, top-up). Handles three failure shapes:
 *  - no default gateway chosen at all
 *  - default gateway chosen but not configured/active yet
 *  - default gateway configured, but this feature isn't implemented for
 *    it (e.g. NextSMS/Beem Africa have no account-stats/sender-id/top-up
 *    API at all, unlike Meseji)
 */
const langOf = (req) => req?.user?.lang || req?.headers?.["x-language"] || "en";

// Only the developer account may see which gateway is behind the SMS module.
// Everyone else gets general messages that never name a provider.
const viewerIsDeveloper = (req) => isDeveloper(req?.user);

const PROVIDER_NAME_RE = /\b(meseji(\.co\.tz)?|next\s?sms|beem(\s+africa)?|zenopay|messaging-service\.co\.tz)\b\s*:?\s*/gi;

// Provider error text can contain the provider's name or raw responses. The
// developer sees it as-is (useful for debugging); everyone else gets it with
// provider names removed, or a generic message if nothing readable is left.
function safeError(req, message) {
  const lang = langOf(req);
  if (viewerIsDeveloper(req)) return message || t("sms_request_failed", lang);
  const cleaned = String(message || "").replace(PROVIDER_NAME_RE, "").trim();
  if (!cleaned || cleaned.length > 200 || /[{<]/.test(cleaned)) return t("sms_request_failed", lang);
  return cleaned;
}

function requireGatewayFeature(res, { gatewayKey, gatewayModule, config }, featureFn) {
  const req = res.req;
  const lang = langOf(req);
  const dev = viewerIsDeveloper(req);

  if (!gatewayKey) {
    res.status(400).json({
      code: "no_default_sms_gateway",
      message: dev ? t("no_default_sms_gateway", lang) : t("sms_not_configured_generic", lang),
    });
    return null;
  }
  if (!gatewayModule || !config) {
    res.status(400).json({
      code: "sms_gateway_not_configured",
      message: dev
        ? t("sms_gateway_not_configured", { gateway: gatewayLabel(gatewayKey) }, lang)
        : t("sms_not_configured_generic", lang),
    });
    return null;
  }
  // featureFn === null means "any configured gateway is fine" (no specific feature needed)
  if (featureFn && typeof gatewayModule[featureFn] !== "function") {
    res.status(400).json({
      code: "sms_feature_not_supported",
      message: dev
        ? t("sms_feature_not_supported", { gateway: gatewayLabel(gatewayKey) }, lang)
        : t("sms_feature_unavailable_generic", lang),
    });
    return null;
  }
  return config;
}

// Totals from OUR OWN sms_logs for one gateway. Used for providers that don't
// expose message statistics through their API.
async function getLocalSmsStats(storeId, gatewayKey) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM sms_logs
      WHERE gateway = $1 AND ($2::uuid IS NULL OR store_id = $2::uuid)`,
    [gatewayKey, storeId || null]
  );
  const sent = parseInt(rows[0]?.sent, 10) || 0;
  const failed = parseInt(rows[0]?.failed, 10) || 0;
  const total = sent + failed;
  return {
    total_messages_sent: sent,
    successful_deliveries: sent,
    failed_messages: failed,
    success_rate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 0,
  };
}

// GET /api/messaging/gateway-info — what the Account & Top-up screen may show.
// Regular users only learn WHAT they can do (check balance, pay directly, or
// send a top-up request) -- never which provider is behind it. The provider
// name, its website and provider-only features go to the developer account.
export const getGatewayInfo = async (req, res) => {
  try {
    const active = await getActiveGateway();
    const mod = active.gatewayModule;
    const has = (fn) => !!mod && typeof mod[fn] === "function";
    const dev = viewerIsDeveloper(req);

    const direct = has("buyCreditsUssd") || has("createZenoPayOrder");
    const capabilities = {
      balance: has("getAccountStats"),
      topupUssd: has("buyCreditsUssd"),
      topupZenoPay: has("createZenoPayOrder"),
      // Providers without a payment API: the client asks our support team,
      // and a developer does the top-up for them.
      topupRequest: !!active.config && !!mod && !direct,
    };

    const body = {
      isDeveloper: dev,
      configured: !!active.config,
      capabilities,
    };

    if (dev) {
      body.gateway = active.gatewayKey;
      body.gatewayLabel = active.gatewayKey ? gatewayLabel(active.gatewayKey) : null;
      body.capabilities = {
        ...capabilities,
        providerStats: active.gatewayKey === "meseji",
        senderIds: has("listSenderIds"),
        deliveryReports: has("getBatchStats"),
      };
    }

    return res.status(200).json(body);
  } catch (err) {
    console.error("Messaging getGatewayInfo error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// Where top-up requests go: SUPPORT_EMAIL (comma-separated), else the support
// admins, else the developer account(s).
function getSupportRecipients() {
  const fromEnv = (process.env.SUPPORT_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const admins = getSupportAdminEmails();
  if (admins.length) return admins;
  return getDeveloperEmails();
}

// One request per store every 10 minutes, so the support inbox can't be flooded.
const topupRequestCooldown = new TtlCache({ ttlMs: 10 * 60 * 1000 });

// POST /api/messaging/topup/request — for gateways that can't be paid through
// an API (Beem Africa, NextSMS). Emails our support team with who is asking,
// for which business and from which domain; a developer then contacts the
// client and does the top-up manually.
export const requestTopup = async (req, res) => {
  const lang = langOf(req);

  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, null);
    if (!config) return;

    const mod = active.gatewayModule;
    if (typeof mod.buyCreditsUssd === "function" || typeof mod.createZenoPayOrder === "function") {
      return res.status(400).json({ message: t("topup_request_not_needed", lang) });
    }

    const storeId = req.user?.current_store_id;
    const userId = req.user?.id;
    const cooldownKey = String(storeId || userId);
    if (topupRequestCooldown.get(cooldownKey)) {
      return res.status(429).json({ message: t("topup_request_already_sent", lang) });
    }

    const recipients = getSupportRecipients();
    if (recipients.length === 0) {
      console.error("Top-up request: no support email configured (SUPPORT_EMAIL / SUPPORT_ADMIN_EMAILS / DEVELOPER_EMAIL).");
      return res.status(503).json({ message: t("topup_request_failed", lang) });
    }

    const [userRes, storeRes] = await Promise.all([
      pool.query("SELECT name, email, phone FROM users WHERE id = $1", [userId]),
      pool.query("SELECT id, name FROM stores WHERE id = $1", [storeId]),
    ]);
    const user = userRes.rows[0] || {};
    const store = storeRes.rows[0] || {};

    const amountNum = parseFloat(req.body?.amount);
    const amount = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;
    const note = String(req.body?.note || "").trim().slice(0, 500);
    const domain = req.headers.origin || process.env.CLIENT_URL || "unknown";

    const baseMessage = "A client has requested an SMS credit top-up. Please contact them to arrange the top-up.";

    const result = await sendEmail({
      to: recipients,
      subject: `SMS top-up request: ${store.name || "Unknown business"}`,
      html: buildEmailHtml({
        recipientName: "Support Team",
        title: "sms_topup_request",
        message: note ? `${baseMessage} Note from client: ${note}` : baseMessage,
        meta: {
          requested_by: `${user.name || "Unknown"} <${user.email || req.user?.email || "-"}>`,
          phone: user.phone || undefined,
          business: store.name ? `${store.name} (${store.id})` : String(storeId || ""),
          system_domain: domain,
          sms_gateway: gatewayLabel(active.gatewayKey),
          amount_tzs: amount || undefined,
          role: req.user?.current_store_role?.role_name || undefined,
          requested_at: new Date().toISOString(),
        },
      }),
    });

    if (!result?.success) {
      return res.status(502).json({ message: t("topup_request_failed", lang) });
    }

    topupRequestCooldown.set(cooldownKey, true);
    return res.status(200).json({ message: t("topup_request_sent", lang) });
  } catch (err) {
    console.error("Messaging requestTopup error:", err);
    return res.status(500).json({ message: t("topup_request_failed", lang) });
  }
};

// POST /api/messaging/send — send an SMS to one or more numbers.
// Uses the system's default SMS gateway (Settings > Configuration), and
// automatically falls back to another configured/active gateway if the
// default one is unreachable or rejects the message — see smsService.js.
// Every send is logged locally (sms_logs) regardless of gateway, so
// History (below) can show messages from every provider in one place.
export const sendMessage = async (req, res) => {
  const { contacts, message } = req.body;

  if (!contacts || !message) {
    return res.status(400).json({ message: "contacts and message are required." });
  }

  const contactList = Array.isArray(contacts)
    ? contacts
    : String(contacts).split(",").map((c) => c.trim()).filter(Boolean);

  if (contactList.length === 0) {
    return res.status(400).json({ message: "At least one valid contact is required." });
  }

  const storeId = req.user?.current_store_id;
  const userId = req.user?.id;
  const batchId = crypto.randomUUID();

  try {
    // Best-effort: if any of these numbers are saved contacts, snapshot
    // their name so the Recently Sent view can show "John" instead of
    // just the raw phone number.
    const known = await pool.query(
      "SELECT phone, name FROM messaging_contacts WHERE store_id = $1 AND phone = ANY($2::text[])",
      [storeId, contactList]
    );
    const nameByPhone = Object.fromEntries(known.rows.map((r) => [r.phone, r.name]));

    const results = await Promise.all(
      contactList.map((contact) =>
        smsService.send(contact, message, {
          storeId,
          userId,
          batchId,
          recipientName: nameByPhone[contact] || null,
        })
      )
    );

    const failed = results.filter((r) => !r.success);

    if (failed.length === 0) {
      return res.status(200).json({
        message: "Message sent.",
        // Which provider handled it is for the developer only
        ...(viewerIsDeveloper(req) ? { gateway: results[0]?.gateway } : {}),
        sent: results.length,
        batchId,
      });
    }

    if (failed.length === results.length) {
      return res.status(400).json({
        message: safeError(req, failed[failed.length - 1]?.error) ,
      });
    }

    return res.status(200).json({
      message: `Sent to ${results.length - failed.length} of ${results.length} recipients.`,
      failed: failed.map((f) => safeError(req, f.error)),
      batchId,
    });
  } catch (err) {
    console.error("Messaging sendMessage error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/history — every SMS ever sent from this system,
// regardless of which gateway handled it (local log, not provider-specific).
// One row per batch (one "send" action), not one per phone number --
// group sends show the group's name; multi-recipient sends show a count.
export const getMessageHistory = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `SELECT
          l.batch_id,
          MIN(l.created_at) AS created_at,
          MIN(l.message) AS message,
          MIN(l.group_name) AS group_name,
          COUNT(*) AS recipient_count,
          COUNT(*) FILTER (WHERE l.status = 'sent') AS sent_count,
          COUNT(*) FILTER (WHERE l.status = 'failed') AS failed_count,
          -- Only meaningful for a single-recipient batch:
          MIN(l.recipient) AS recipient,
          MIN(l.recipient_name) AS recipient_name,
          MIN(u.name) AS sent_by
       FROM sms_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.store_id = $1
       GROUP BY l.batch_id
       ORDER BY MIN(l.created_at) DESC
       LIMIT 200`,
      [storeId]
    );

    const messages = result.rows.map((row) => {
      const sentCount = Number(row.sent_count);
      const failedCount = Number(row.failed_count);
      const status = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";

      return {
        batch_id: row.batch_id,
        created_at: row.created_at,
        message: row.message,
        status,
        sent_count: sentCount,
        failed_count: failedCount,
        recipient_count: Number(row.recipient_count),
        group_name: row.group_name,
        recipient: row.recipient,
        recipient_name: row.recipient_name,
        sent_by: row.sent_by,
      };
    });

    return res.status(200).json({ messages });
  } catch (err) {
    console.error("Messaging getMessageHistory error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/history/:batchId — every individual recipient of one
// send action, for the "View" modal on the Recently Sent table.
export const getMessageBatchDetail = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `SELECT l.id, l.recipient, l.recipient_name, l.status, l.error, l.created_at,
              l.group_name, l.message, u.name AS sent_by
       FROM sms_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.batch_id = $1 AND l.store_id = $2
       ORDER BY l.recipient_name NULLS LAST, l.recipient`,
      [req.params.batchId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Not found." });
    }

    return res.status(200).json({
      batch_id: req.params.batchId,
      message: result.rows[0].message,
      created_at: result.rows[0].created_at,
      group_name: result.rows[0].group_name,
      sent_by: result.rows[0].sent_by,
      recipients: result.rows.map((r) => ({
        id: r.id,
        recipient: r.recipient,
        recipient_name: r.recipient_name,
        status: r.status,
        error: r.error,
      })),
    });
  } catch (err) {
    console.error("Messaging getMessageBatchDetail error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/batches/:batchId/stats — delivery stats for one batch
// (provider-specific — only meaningful for the gateway that created the batch)
export const getBatchStats = async (req, res) => {
  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "getBatchStats");
    if (!config) return;

    const result = await active.gatewayModule.getBatchStats(config, req.params.batchId);
    if (result.success) return res.status(200).json(result.data);
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging getBatchStats error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/account-stats — balance + message totals for whichever
// gateway is currently set as default. Balance (and, for Meseji, the totals)
// come from the provider; for providers without a stats API the totals are
// taken from our own sms_logs for that gateway.
export const getAccountStats = async (req, res) => {
  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, null);
    if (!config) return;

    let provider = {};
    let balanceError = null;
    if (typeof active.gatewayModule.getAccountStats === "function") {
      const result = await active.gatewayModule.getAccountStats(config);
      if (result.success) provider = result.data || {};
      else balanceError = result.error || null;
    }

    const providerHasTotals = provider.total_messages_sent !== undefined;
    const local = providerHasTotals
      ? {}
      : await getLocalSmsStats(req.user?.current_store_id, active.gatewayKey);

    const dev = viewerIsDeveloper(req);
    const body = {
      ...local,
      ...provider,
      balance: provider.balance ?? null,
      // Provider error text names the provider -- developer only. Others just
      // learn that the balance couldn't be read.
      balanceError: balanceError ? (dev ? balanceError : true) : null,
      statsSource: providerHasTotals ? "provider" : "local",
    };
    if (dev) {
      body.gateway = active.gatewayKey;
      body.gatewayLabel = gatewayLabel(active.gatewayKey);
    } else {
      // Raw provider payloads can carry provider-specific fields
      for (const key of Object.keys(body)) {
        if (!["total_messages_sent", "successful_deliveries", "failed_messages", "success_rate", "balance", "balanceError", "statsSource"].includes(key)) {
          delete body[key];
        }
      }
    }
    return res.status(200).json(body);
  } catch (err) {
    console.error("Messaging getAccountStats error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/sender-ids — sender IDs for whichever gateway is
// currently set as default.
export const listSenderIds = async (req, res) => {
  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "listSenderIds");
    if (!config) return;

    const result = await active.gatewayModule.listSenderIds(config);
    if (result.success) {
      const senderIds = Array.isArray(result.data) ? result.data : result.data?.senderIds || [];
      return res.status(200).json({
        senderIds,
        ...(viewerIsDeveloper(req) ? { gateway: active.gatewayKey, gatewayLabel: gatewayLabel(active.gatewayKey) } : {}),
      });
    }
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging listSenderIds error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/sender-ids — request approval for a new sender ID
// on whichever gateway is currently set as default.
export const requestSenderId = async (req, res) => {
  const { name, description, sampleMessage } = req.body;

  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "requestSenderId");
    if (!config) return;

    const result = await active.gatewayModule.requestSenderId(config, { name, description, sampleMessage });
    if (result.success) return res.status(201).json(result.data);
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging requestSenderId error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/topup/ussd — USSD push top-up on the default gateway
export const buyCreditsUssd = async (req, res) => {
  const { amountTzs, phone } = req.body;

  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "buyCreditsUssd");
    if (!config) return;

    const result = await active.gatewayModule.buyCreditsUssd(config, { amountTzs, phone });
    if (result.success) return res.status(200).json(result.data);
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging buyCreditsUssd error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/topup/zenopay — create a top-up order on the default gateway
export const createZenoPayOrder = async (req, res) => {
  const { amount, buyerName, buyerPhone } = req.body;

  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "createZenoPayOrder");
    if (!config) return;

    const result = await active.gatewayModule.createZenoPayOrder(config, { amount, buyerName, buyerPhone });
    if (result.success) return res.status(200).json(result.data);
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging createZenoPayOrder error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/messaging/topup/zenopay/status?orderId=... — poll a top-up order
export const checkZenoPayStatus = async (req, res) => {
  try {
    const active = await getActiveGateway();
    const config = requireGatewayFeature(res, active, "checkZenoPayStatus");
    if (!config) return;

    const result = await active.gatewayModule.checkZenoPayStatus(config, req.query.orderId);
    if (result.success) return res.status(200).json(result.data);
    return res.status(400).json({ message: safeError(req, result.error) });
  } catch (err) {
    console.error("Messaging checkZenoPayStatus error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CONTACT GROUPS / SUBGROUPS
// A group with parent_group_id = NULL is top-level; one with a
// parent_group_id is a subgroup of it (one level deep). Contacts are
// global (per store) and can belong to MULTIPLE groups via the
// messaging_contact_groups join table -- see helper below for the rule
// that a subgroup membership always implies parent-group membership too.
// ─────────────────────────────────────────────────────────────────────────

// Adds a contact to a group. If that group is itself a subgroup, also
// adds the contact to its parent group (a contact can never be in a
// subgroup without also being in the parent) -- this is the one rule
// every "add to group" path in this file goes through.
async function addContactToGroup(client, contactId, groupId) {
  const group = await client.query(
    "SELECT id, parent_group_id FROM messaging_groups WHERE id = $1",
    [groupId]
  );
  if (group.rows.length === 0) {
    const err = new Error("Group not found.");
    err.code = "GROUP_NOT_FOUND";
    throw err;
  }

  await client.query(
    "INSERT INTO messaging_contact_groups (contact_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [contactId, groupId]
  );

  const parentGroupId = group.rows[0].parent_group_id;
  if (parentGroupId) {
    await client.query(
      "INSERT INTO messaging_contact_groups (contact_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [contactId, parentGroupId]
    );
  }
}

// (re-export) addContactToGroup;

// GET /api/messaging/groups — flat list; frontend nests by parent_group_id
export const listGroups = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `SELECT g.id, g.name, g.parent_group_id, g.created_at,
              (SELECT COUNT(*) FROM messaging_contact_groups mcg WHERE mcg.group_id = g.id) AS contact_count
       FROM messaging_groups g
       WHERE g.store_id = $1
       ORDER BY g.parent_group_id NULLS FIRST, g.name ASC`,
      [storeId]
    );
    return res.status(200).json({ groups: result.rows });
  } catch (err) {
    console.error("Messaging listGroups error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/groups — { name, parentGroupId? }
export const createGroup = async (req, res) => {
  const { name, parentGroupId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Group name is required." });
  }

  try {
    const storeId = req.user.current_store_id;

    if (parentGroupId) {
      const parent = await pool.query(
        "SELECT id, parent_group_id FROM messaging_groups WHERE id = $1 AND store_id = $2",
        [parentGroupId, storeId]
      );
      if (parent.rows.length === 0) {
        return res.status(404).json({ message: "Parent group not found." });
      }
      if (parent.rows[0].parent_group_id) {
        // Keep the hierarchy one level deep -- a subgroup can't have its own subgroups.
        return res.status(400).json({ message: "A subgroup can't contain further subgroups." });
      }
    }

    const result = await pool.query(
      `INSERT INTO messaging_groups (store_id, parent_group_id, name)
       VALUES ($1, $2, $3) RETURNING id, name, parent_group_id, created_at`,
      [storeId, parentGroupId || null, name.trim()]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Messaging createGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// PUT /api/messaging/groups/:id — rename
export const updateGroup = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Group name is required." });
  }

  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `UPDATE messaging_groups SET name = $1 WHERE id = $2 AND store_id = $3 RETURNING id, name, parent_group_id, created_at`,
      [name.trim(), req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Group not found." });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Messaging updateGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// DELETE /api/messaging/groups/:id — cascades to its subgroups and their
// memberships (the contacts themselves are NOT deleted -- they're global).
export const deleteGroup = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      "DELETE FROM messaging_groups WHERE id = $1 AND store_id = $2 RETURNING id",
      [req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Group not found." });
    return res.status(200).json({ message: "Group deleted." });
  } catch (err) {
    console.error("Messaging deleteGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CONTACTS
// Contacts are global to the store. "Contact List" (listAllContacts) shows
// every one of them regardless of group; each group's contact list is a
// filtered view via messaging_contact_groups.
// ─────────────────────────────────────────────────────────────────────────

// GET /api/messaging/contacts — every contact for this store, with the
// group(s) each one belongs to (for the "Contact List" view).
export const listAllContacts = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `SELECT c.id, c.name, c.phone, c.created_at,
              COALESCE(
                json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                FILTER (WHERE g.id IS NOT NULL),
                '[]'
              ) AS groups
       FROM messaging_contacts c
       LEFT JOIN messaging_contact_groups mcg ON mcg.contact_id = c.id
       LEFT JOIN messaging_groups g ON g.id = mcg.group_id
       WHERE c.store_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [storeId]
    );
    return res.status(200).json({ contacts: result.rows });
  } catch (err) {
    console.error("Messaging listAllContacts error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/contacts — register one contact at a time.
// { name?, phone, groupId? } -- groupId is optional (item #1: pick a
// group/subgroup right when registering someone, or leave unassigned).
export const createContact = async (req, res) => {
  const { name, phone, groupId } = req.body;
  const storeId = req.user.current_store_id;

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const contactResult = await client.query(
      `INSERT INTO messaging_contacts (store_id, name, phone)
       VALUES ($1, $2, $3) RETURNING id, name, phone, created_at`,
      [storeId, (name || "").trim() || null, String(phone).trim()]
    );
    const contact = contactResult.rows[0];

    if (groupId) {
      await addContactToGroup(client, contact.id, groupId);
    }

    await client.query("COMMIT");
    return res.status(201).json(contact);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "GROUP_NOT_FOUND") {
      return res.status(404).json({ message: err.message });
    }
    console.error("Messaging createContact error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// GET /api/messaging/groups/:id/contacts — contacts in ONE group/subgroup
export const listGroupContacts = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `SELECT c.id, c.name, c.phone, c.created_at,
              COALESCE(
                json_agg(json_build_object('id', g2.id, 'name', g2.name) ORDER BY g2.name)
                FILTER (WHERE g2.id IS NOT NULL),
                '[]'
              ) AS groups
       FROM messaging_contacts c
       JOIN messaging_contact_groups mcg ON mcg.contact_id = c.id
       LEFT JOIN messaging_contact_groups mcg2 ON mcg2.contact_id = c.id
       LEFT JOIN messaging_groups g2 ON g2.id = mcg2.group_id
       WHERE mcg.group_id = $1 AND c.store_id = $2
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.params.id, storeId]
    );
    return res.status(200).json({ contacts: result.rows });
  } catch (err) {
    console.error("Messaging listGroupContacts error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/groups/:id/contacts — register new contact(s)
// directly into this group. { name?, phone } or { contacts: [{name, phone}] }
// A phone that already exists for this store is reused (not duplicated) --
// it's just added to this group as well.
export const addContacts = async (req, res) => {
  const groupId = req.params.id;
  const storeId = req.user.current_store_id;
  const incoming = Array.isArray(req.body.contacts) ? req.body.contacts : [req.body];

  const cleaned = incoming
    .map((c) => ({ name: (c.name || "").trim() || null, phone: String(c.phone || "").trim() }))
    .filter((c) => c.phone);

  if (cleaned.length === 0) {
    return res.status(400).json({ message: "At least one contact with a phone number is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const group = await client.query(
      "SELECT id FROM messaging_groups WHERE id = $1 AND store_id = $2",
      [groupId, storeId]
    );
    if (group.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Group not found." });
    }

    const touched = [];
    for (const c of cleaned) {
      const existing = await client.query(
        "SELECT id, name, phone, created_at FROM messaging_contacts WHERE store_id = $1 AND phone = $2 LIMIT 1",
        [storeId, c.phone]
      );

      let contact;
      if (existing.rows.length > 0) {
        contact = existing.rows[0];
      } else {
        const created = await client.query(
          `INSERT INTO messaging_contacts (store_id, name, phone) VALUES ($1, $2, $3)
           RETURNING id, name, phone, created_at`,
          [storeId, c.name, c.phone]
        );
        contact = created.rows[0];
      }

      await addContactToGroup(client, contact.id, groupId);
      touched.push(contact);
    }

    await client.query("COMMIT");
    return res.status(201).json({ contacts: touched });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Messaging addContacts error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// POST /api/messaging/groups/:id/assign — add EXISTING contacts (picked
// from the Contact List) to this group. { contactIds: [1, 2, 3] }
export const assignContactsToGroup = async (req, res) => {
  const groupId = req.params.id;
  const storeId = req.user.current_store_id;
  const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];

  if (contactIds.length === 0) {
    return res.status(400).json({ message: "Select at least one contact." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const group = await client.query(
      "SELECT id FROM messaging_groups WHERE id = $1 AND store_id = $2",
      [groupId, storeId]
    );
    if (group.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Group not found." });
    }

    const validContacts = await client.query(
      "SELECT id FROM messaging_contacts WHERE store_id = $1 AND id = ANY($2::int[])",
      [storeId, contactIds]
    );

    for (const row of validContacts.rows) {
      await addContactToGroup(client, row.id, groupId);
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: `Added ${validContacts.rows.length} contact(s) to the group.` });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Messaging assignContactsToGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// DELETE /api/messaging/groups/:groupId/contacts/:contactId — remove a
// contact from ONE group (membership only, the contact itself stays).
// If this group is a top-level (parent) group, also removes the contact
// from all of its subgroups -- a contact can't stay in a subgroup once
// it's no longer in the parent.
export const removeContactFromGroup = async (req, res) => {
  const { groupId, contactId } = req.params;
  const storeId = req.user.current_store_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const group = await client.query(
      "SELECT id, parent_group_id FROM messaging_groups WHERE id = $1 AND store_id = $2",
      [groupId, storeId]
    );
    if (group.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Group not found." });
    }

    await client.query(
      "DELETE FROM messaging_contact_groups WHERE contact_id = $1 AND group_id = $2",
      [contactId, groupId]
    );

    if (!group.rows[0].parent_group_id) {
      // top-level group -- also drop membership from its subgroups
      await client.query(
        `DELETE FROM messaging_contact_groups
         WHERE contact_id = $1
           AND group_id IN (SELECT id FROM messaging_groups WHERE parent_group_id = $2)`,
        [contactId, groupId]
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Removed from group." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Messaging removeContactFromGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// PUT /api/messaging/contacts/:id — edit a contact's name/phone
export const updateContact = async (req, res) => {
  const { name, phone } = req.body;

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `UPDATE messaging_contacts SET name = $1, phone = $2
       WHERE id = $3 AND store_id = $4
       RETURNING id, name, phone, created_at`,
      [(name || "").trim() || null, String(phone).trim(), req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Contact not found." });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Messaging updateContact error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// PUT /api/messaging/contacts/:id/groups — replace a contact's FULL set of
// group/subgroup memberships in one go. { groupIds: [1, 2, 3] } (empty
// array removes it from every group, keeping the contact itself).
//
// Still goes through addContactToGroup() for anything newly added, so
// picking a subgroup here also adds its parent automatically. Symmetric
// rule on removal: if a top-level group is being removed from the set,
// its subgroups are removed too (a contact can't stay in a subgroup once
// it's out of the parent).
export const setContactGroups = async (req, res) => {
  const contactId = req.params.id;
  const storeId = req.user.current_store_id;
  const requestedGroupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds.map(Number) : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const contact = await client.query(
      "SELECT id FROM messaging_contacts WHERE id = $1 AND store_id = $2",
      [contactId, storeId]
    );
    if (contact.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Contact not found." });
    }

    const allGroups = await client.query(
      "SELECT id, parent_group_id FROM messaging_groups WHERE store_id = $1",
      [storeId]
    );
    const groupById = new Map(allGroups.rows.map((g) => [g.id, g]));

    const current = await client.query(
      "SELECT group_id FROM messaging_contact_groups WHERE contact_id = $1",
      [contactId]
    );
    const currentGroupIds = current.rows.map((r) => r.group_id);

    // Expand the requested set: picking a subgroup implies its parent too.
    const targetSet = new Set(requestedGroupIds.filter((id) => groupById.has(id)));
    for (const id of [...targetSet]) {
      const parentId = groupById.get(id)?.parent_group_id;
      if (parentId) targetSet.add(parentId);
    }

    const toAdd = [...targetSet].filter((id) => !currentGroupIds.includes(id));
    const toRemove = currentGroupIds.filter((id) => !targetSet.has(id));

    // If a top-level group is being removed, its subgroups must go too,
    // even if the caller didn't explicitly list them.
    for (const removedId of [...toRemove]) {
      const group = groupById.get(removedId);
      if (group && !group.parent_group_id) {
        for (const g of allGroups.rows) {
          if (g.parent_group_id === removedId && currentGroupIds.includes(g.id) && !toRemove.includes(g.id)) {
            toRemove.push(g.id);
          }
        }
      }
    }

    if (toRemove.length > 0) {
      await client.query(
        "DELETE FROM messaging_contact_groups WHERE contact_id = $1 AND group_id = ANY($2::int[])",
        [contactId, toRemove]
      );
    }

    for (const groupId of toAdd) {
      await addContactToGroup(client, contactId, groupId);
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Group memberships updated." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Messaging setContactGroups error:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// DELETE /api/messaging/contacts/:id — delete a contact entirely
// (from the Contact List, removes them from every group too via cascade).
export const deleteContact = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      "DELETE FROM messaging_contacts WHERE id = $1 AND store_id = $2 RETURNING id",
      [req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Contact not found." });
    return res.status(200).json({ message: "Contact deleted." });
  } catch (err) {
    console.error("Messaging deleteContact error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/groups/:id/send — bulk SMS to everyone in a group
// (optionally including its subgroup's contacts too)
export const sendToGroup = async (req, res) => {
  const groupId = req.params.id;
  const { message, includeSubgroups } = req.body;
  const storeId = req.user.current_store_id;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message is required." });
  }

  try {
    const group = await pool.query(
      "SELECT id, name, parent_group_id FROM messaging_groups WHERE id = $1 AND store_id = $2",
      [groupId, storeId]
    );
    if (group.rows.length === 0) return res.status(404).json({ message: "Group not found." });

    const groupIds = [groupId];
    if (includeSubgroups && !group.rows[0].parent_group_id) {
      const subgroups = await pool.query(
        "SELECT id FROM messaging_groups WHERE parent_group_id = $1 AND store_id = $2",
        [groupId, storeId]
      );
      groupIds.push(...subgroups.rows.map((r) => r.id));
    }

    const contactsResult = await pool.query(
      `SELECT DISTINCT c.phone, c.name
       FROM messaging_contacts c
       JOIN messaging_contact_groups mcg ON mcg.contact_id = c.id
       WHERE mcg.group_id = ANY($1::int[]) AND c.store_id = $2`,
      [groupIds, storeId]
    );

    if (contactsResult.rows.length === 0) {
      return res.status(400).json({ message: "This group has no contacts yet." });
    }

    const batchId = crypto.randomUUID();
    const context = {
      storeId,
      userId: req.user?.id,
      batchId,
      groupId: group.rows[0].id,
      groupName: group.rows[0].name,
    };
    const results = await Promise.all(
      contactsResult.rows.map((c) => smsService.send(c.phone, message, { ...context, recipientName: c.name || null }))
    );
    const failed = results.filter((r) => !r.success);

    return res.status(200).json({
      message: `Sent to ${results.length - failed.length} of ${results.length} contacts.`,
      total: results.length,
      failed: failed.length,
      batchId,
    });
  } catch (err) {
    console.error("Messaging sendToGroup error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SMS TEMPLATES
// ─────────────────────────────────────────────────────────────────────────

// GET /api/messaging/templates
export const listTemplates = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      "SELECT id, name, content, created_at, updated_at FROM sms_templates WHERE store_id = $1 ORDER BY updated_at DESC",
      [storeId]
    );
    return res.status(200).json({ templates: result.rows });
  } catch (err) {
    console.error("Messaging listTemplates error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/messaging/templates — { name, content }
export const createTemplate = async (req, res) => {
  const { name, content } = req.body;
  if (!name || !name.trim() || !content || !content.trim()) {
    return res.status(400).json({ message: "Template name and content are required." });
  }

  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `INSERT INTO sms_templates (store_id, name, content) VALUES ($1, $2, $3)
       RETURNING id, name, content, created_at, updated_at`,
      [storeId, name.trim(), content.trim()]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Messaging createTemplate error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// PUT /api/messaging/templates/:id — { name, content }
export const updateTemplate = async (req, res) => {
  const { name, content } = req.body;
  if (!name || !name.trim() || !content || !content.trim()) {
    return res.status(400).json({ message: "Template name and content are required." });
  }

  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      `UPDATE sms_templates SET name = $1, content = $2, updated_at = NOW()
       WHERE id = $3 AND store_id = $4
       RETURNING id, name, content, created_at, updated_at`,
      [name.trim(), content.trim(), req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found." });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Messaging updateTemplate error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// DELETE /api/messaging/templates/:id
export const deleteTemplate = async (req, res) => {
  try {
    const storeId = req.user.current_store_id;
    const result = await pool.query(
      "DELETE FROM sms_templates WHERE id = $1 AND store_id = $2 RETURNING id",
      [req.params.id, storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found." });
    return res.status(200).json({ message: "Template deleted." });
  } catch (err) {
    console.error("Messaging deleteTemplate error:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};
export { addContactToGroup };
