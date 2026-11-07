/**
 * Beem Africa SMS Gateway
 * API Docs: https://apisms.beem.africa
 *
 * Required config keys: api_key, secret_key, sender_name
 */

import https from 'https';
/**
 * Send an SMS via Beem Africa gateway.
 *
 * @param {object} config  - { api_key, secret_key, sender_name }
 * @param {string} to      - recipient phone number (e.g. "255712345678")
 * @param {string} message - SMS body text
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function sendSms(config, to, message) {
  const { api_key, secret_key, sender_name } = config;

  if (!api_key || !secret_key || !sender_name) {
    return { success: false, error: "Beem Africa: api_key, secret_key and sender_name are required." };
  }

  const credentials = Buffer.from(`${api_key}:${secret_key}`).toString("base64");

  const payload = JSON.stringify({
    source_addr: sender_name,
    schedule_time: "",
    encoding: 0,
    message: message,
    recipients: [
      { recipient_id: 1, dest_addr: String(to) },
    ],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "apisms.beem.africa",
      port: 443,
      path: "/v1/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentials}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: parsed });
          } else {
            resolve({ success: false, error: parsed?.message || `HTTP ${res.statusCode}`, data: parsed });
          }
        } catch {
          resolve({ success: false, error: `HTTP ${res.statusCode} — invalid JSON response` });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Check that the saved credentials are accepted by Beem WITHOUT sending any
 * SMS or using credit -- it only reads the account balance.
 */
async function verifyCredentials(config) {
  const api_key = String(config?.api_key || "").trim();
  const secret_key = String(config?.secret_key || "").trim();
  if (!api_key || !secret_key) {
    return { success: false, error: "Beem Africa: api_key and secret_key are required." };
  }

  const credentials = Buffer.from(`${api_key}:${secret_key}`).toString("base64");

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "apisms.beem.africa",
        port: 443,
        path: "/public/v1/vendors/balance",
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Basic ${credentials}` },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch { /* ignore */ }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const balance = parsed?.data?.credit_balance ?? null;
            resolve({ success: true, data: { balance } });
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ success: false, error: "Beem Africa: invalid api_key or secret_key." });
          } else {
            resolve({ success: false, error: parsed?.message || `HTTP ${res.statusCode}` });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.end();
  });
}

/**
 * Account balance. Beem has no stats/top-up API, so balance is all we can read
 * from the provider (message totals come from our own sms_logs).
 */
async function getAccountStats(config) {
  const result = await verifyCredentials(config);
  if (!result.success) return result;
  return { success: true, data: { balance: result.data.balance } };
}

export { sendSms, verifyCredentials, getAccountStats };

