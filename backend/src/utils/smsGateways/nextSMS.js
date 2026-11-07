// path: backend/utils/smsGateways/nextSMS.js
/**
 * NextSMS (Messaging Service API V1 - Basic auth) Gateway
 * API Docs: https://messaging-service.co.tz (Messaging Service API V1 - Basic auth)
 *
 * Required config keys: username, password, sender_name
 *
 * Auth: HTTP Basic -- header "Authorization: Basic base64(username:password)".
 * NextSMS no longer uses an API token; the account username and password
 * are the credentials.
 * Base URL: https://messaging-service.co.tz
 */

import https from 'https';
/**
 * NextSMS's own example uses E.164-style numbers without a "+"
 * (e.g. "255716718040"). Normalize defensively the same way as the
 * other gateways, since callers in this app don't all format numbers
 * the same way.
 */
function normalizePhone(raw) {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) {
    digits = "255" + digits.slice(1);
  } else if (digits.length === 9) {
    digits = "255" + digits;
  }
  return digits;
}

/**
 * Build the Basic auth header value from the account credentials.
 */
function basicAuth(username, password) {
  return "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

/**
 * Low-level request helper shared by every NextSMS endpoint below.
 * Always logs the raw response server-side for easy debugging.
 */
function request(method, path, credentials, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "messaging-service.co.tz",
      port: 443,
      path,
      method,
      headers: {
        "Authorization": basicAuth(credentials.username, credentials.password),
        "Accept": "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        console.log(`[NextSMS] ${method} ${path} -> HTTP ${res.statusCode} — ${responseBody}`);

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
 * Send an SMS via NextSMS.
 *
 * @param {object} config  - { username, password, sender_name }
 * @param {string|string[]} to - recipient phone number(s)
 * @param {string} message - SMS body text
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function sendSms(config, to, message) {
  const username = String(config?.username || "").trim();
  const password = String(config?.password || "").trim();
  const sender_name = String(config?.sender_name || "").trim();

  if (!username || !password || !sender_name) {
    return { success: false, error: "NextSMS: username, password and sender_name are required." };
  }

  const toField = Array.isArray(to) ? to.map(normalizePhone) : normalizePhone(to);

  const result = await request("POST", "/api/sms/v1/text/single", { username, password }, {
    from: sender_name,
    to: toField,
    text: message,
    flash: 0,
  });

  if (!result.success) return result;

  // HTTP 200 just means the request was accepted -- each message in the
  // response array has its own status group (PENDING/DELIVERY/FAILED/
  // REJECTED, see NextSMS's status code table). Treat it as a failure
  // only if EVERY message was rejected/failed outright.
  const messages = result.data?.messages || [];
  const allFailed =
    messages.length > 0 &&
    messages.every((m) => ["FAILED", "REJECTED"].includes(m.status?.groupName));

  if (allFailed) {
    return {
      success: false,
      error: messages[0]?.status?.description || "Message was rejected by NextSMS.",
      data: result.data,
    };
  }

  return result;
}

/**
 * GET /api/sms/v1/balance — current SMS credit balance.
 * Mapped to the same shape the Messaging > Account tab expects
 * (balance/total_messages_sent/etc.) so it works whether the default
 * gateway is Meseji or NextSMS -- fields NextSMS doesn't provide
 * (message totals, success rate) are simply left undefined, and the UI
 * already shows "-" for those.
 */
async function getAccountStats(config) {
  const username = String(config?.username || "").trim();
  const password = String(config?.password || "").trim();
  if (!username || !password) {
    return { success: false, error: "NextSMS: username and password are required." };
  }

  const result = await request("GET", "/api/sms/v1/balance", { username, password });
  if (!result.success) return result;

  const d = result.data || {};
  return {
    success: true,
    data: {
      // Number of SMS left. `display` can be a money amount (TZS), so prefer sms_balance.
      balance: d.sms_balance ?? d.display,
      sms_balance: d.sms_balance,
      over_draft: d.over_draft,
      channel: d.default,
    },
  };
}

/**
 * Check that the saved credentials are accepted by NextSMS WITHOUT sending
 * any SMS or using any credit -- it only reads the account balance.
 * (The sender name can't be validated this way; it is checked when the
 * first real message is sent.)
 */
async function verifyCredentials(config) {
  const username = String(config?.username || "").trim();
  const password = String(config?.password || "").trim();
  if (!username || !password) {
    return { success: false, error: "NextSMS: username and password are required." };
  }

  const result = await request("GET", "/api/sms/v1/balance", { username, password });
  if (!result.success) return result;

  const d = result.data || {};
  return { success: true, data: { balance: d.sms_balance ?? d.display ?? null } };
}

export { sendSms, getAccountStats, verifyCredentials };

