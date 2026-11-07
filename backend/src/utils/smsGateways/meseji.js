/**
 * Meseji.co.tz SMS Gateway + Messaging API client
 * API Docs: https://meseji.co.tz/docs
 *
 * Required config keys for sending SMS: api_key, sender_id
 * Some endpoints below (account management, top-up) only need api_key.
 *
 * Auth: header "x-api-key: <api_key>"
 * Base URL: https://meseji.co.tz/api/v1
 */

import https from 'https';
/**
 * Meseji expects Tanzanian numbers as 2557XXXXXXXX (no "+", no leading 0).
 * The rest of the app doesn't enforce a single phone format everywhere,
 * so normalize defensively rather than assuming callers already did it.
 */
function normalizePhone(raw) {
  let digits = String(raw || "").replace(/[^\d]/g, ""); // strip +, spaces, dashes
  if (digits.startsWith("0")) {
    digits = "255" + digits.slice(1);
  } else if (digits.length === 9) {
    // e.g. "744963858" with no country code and no leading 0
    digits = "255" + digits;
  }
  return digits;
}

/**
 * Low-level request helper shared by every Meseji endpoint below.
 * Always logs the raw response server-side — Meseji's exact error shape
 * for auth/balance/sender-id failures isn't documented, so this is the
 * fastest way to see what actually came back when something fails.
 */
function request(method, path, apiKey, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "meseji.co.tz",
      port: 443,
      path: `/api/v1${path}`,
      method,
      headers: {
        "x-api-key": apiKey,
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        console.log(`[Meseji] ${method} ${path} -> HTTP ${res.statusCode} — ${responseBody}`);

        let parsed = null;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : null;
        } catch {
          // fall through with parsed = null
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data: parsed ?? { raw: responseBody } });
        } else {
          resolve({
            success: false,
            error: parsed?.message || parsed?.error || (responseBody ? responseBody.slice(0, 300) : `HTTP ${res.statusCode}`),
            data: parsed,
          });
        }
      });
    });

    req.on("error", (err) => resolve({ success: false, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Send an SMS via the Meseji.co.tz gateway.
 *
 * @param {object} config  - { api_key, sender_id }
 * @param {string|string[]} to - recipient phone number(s)
 * @param {string} message - SMS body text
 * @param {string} [senderIdOverride] - use a different approved sender ID for this send
 */
async function sendSms(config, to, message, senderIdOverride) {
  const { api_key, sender_id } = config;

  if (!api_key || !sender_id) {
    return { success: false, error: "Meseji: api_key and sender_id are required." };
  }

  const contacts = Array.isArray(to)
    ? to.map(normalizePhone).join(", ")
    : normalizePhone(to);

  return request("POST", "/sms/send", api_key, {
    sender_id: senderIdOverride || sender_id,
    message,
    contacts,
  });
}

/** GET /sms/stats/:batch_id — delivery stats for a batch */
async function getBatchStats(config, batchId) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  return request("GET", `/sms/stats/${encodeURIComponent(batchId)}`, config.api_key);
}

/** GET /sms/user-stats — account-wide messaging stats + balance */
async function getAccountStats(config) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  return request("GET", "/sms/user-stats", config.api_key);
}

/** GET /sms/history — sent message history */
async function getMessageHistory(config) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  return request("GET", "/sms/history", config.api_key);
}

/** GET /sms/sender-ids — list sender IDs + approval status */
async function listSenderIds(config) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  return request("GET", "/sms/sender-ids", config.api_key);
}

/**
 * POST /sms/request-sender-id — submit a new sender ID for approval.
 * name: 1-11 chars. sampleMessage: at least 10 words (Meseji's own rule).
 */
async function requestSenderId(config, { name, description, sampleMessage }) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  if (!name || !sampleMessage) {
    return { success: false, error: "Sender ID name and a sample message are required." };
  }
  return request("POST", "/sms/request-sender-id", config.api_key, {
    name,
    description: description || "",
    sampleMessage,
  });
}

/** POST /payments/buy — USSD push top-up (mobile money) */
async function buyCreditsUssd(config, { amountTzs, phone }) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  if (!amountTzs || !phone) {
    return { success: false, error: "Amount and phone number are required." };
  }
  return request("POST", "/payments/buy", config.api_key, {
    amount_tzs: Number(amountTzs),
    phone: normalizePhone(phone),
  });
}

/** POST /payments/zenopay/create — ZenoPay Lipa Namba / QR order */
async function createZenoPayOrder(config, { amount, buyerName, buyerPhone }) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  if (!amount || !buyerPhone) {
    return { success: false, error: "Amount and buyer phone number are required." };
  }
  return request("POST", "/payments/zenopay/create", config.api_key, {
    amount: Number(amount),
    buyer_name: buyerName || "",
    buyer_phone: normalizePhone(buyerPhone),
  });
}

/** GET /payments/zenopay/status?order_id=... — poll a ZenoPay order */
async function checkZenoPayStatus(config, orderId) {
  if (!config.api_key) return { success: false, error: "Meseji: api_key is required." };
  if (!orderId) return { success: false, error: "order_id is required." };
  return request("GET", `/payments/zenopay/status?order_id=${encodeURIComponent(orderId)}`, config.api_key);
}

/**
 * Check that the API key is accepted by Meseji WITHOUT sending any SMS or
 * using credit -- it only reads the account stats/balance.
 */
async function verifyCredentials(config) {
  const api_key = String(config?.api_key || "").trim();
  if (!api_key) return { success: false, error: "Meseji: api_key is required." };

  const result = await request("GET", "/sms/user-stats", api_key);
  if (!result.success) return result;

  const d = result.data?.data || result.data || {};
  return { success: true, data: { balance: d.balance ?? d.sms_balance ?? null } };
}

export { verifyCredentials, sendSms, getBatchStats, getAccountStats, getMessageHistory, listSenderIds, requestSenderId, buyCreditsUssd, createZenoPayOrder, checkZenoPayStatus };

