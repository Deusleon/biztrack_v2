import crypto from 'crypto';
import 'dotenv/config';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;

function getConfig() {
  return {
    baseUrl: process.env.CLICKPESA_BASE_URL,
    apiKey: process.env.CLICKPESA_API_KEY,
    clientId: process.env.CLICKPESA_API_CLIENT_ID,
    webhookSecret: process.env.CLICKPESA_WEBHOOK_SECRET,
    initiatePath: '/payments/initiate-ussd-push-request',
    verifyPath: '/api/subscriptions/verify',
    callbackUrl: process.env.CLICKPESA_CALLBACK_URL,
  };
}

 async function getBearerToken() {
  const cfg = getConfig();
  if (!cfg.baseUrl || !cfg.clientId || !cfg.apiKey) {
    throw new Error('CLICKPESA_BASE_URL, CLICKPESA_API_CLIENT_ID, or CLICKPESA_API_KEY is not configured');
  }
  const path = '/generate-token';
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { "Accept": '*/*', "client-id": cfg.clientId, "api-key": cfg.apiKey }
  });

  if (!response.ok) {
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    const err = new Error(json?.message);
    err.statusCode = response.status;
    err.response = json;
    throw err;
  }

  const data = await response.json();
  return data?.token;
}

async function buildHeaders(idempotencyKey) {
  const cfg = getConfig();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (cfg.apiKey) {
    headers.Authorization = await getBearerToken();
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, payload, options = {}) {
  const cfg = getConfig();
  if (!cfg.baseUrl) {
    throw new Error('CLICKPESA_BASE_URL is not configured');
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: await buildHeaders(options.idempotencyKey),
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });

      const text = await response.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!response.ok) {
        const err = new Error(json?.message || `ClickPesa request failed: ${response.status}`);
        err.statusCode = response.status;
        err.response = json;
        throw err;
      }

      return json;
    } catch (error) {
      const isTimeout = error?.name === 'AbortError';
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        if (isTimeout) {
          const timeoutError = new Error('ClickPesa request timeout');
          timeoutError.code = 'CLICKPESA_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      }
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Unreachable ClickPesa request failure');
}

async function initiateCheckout(payload, options = {}) {
  const cfg = getConfig();
  const requestPayload = {
    ...payload,
    callback_url: payload.callback_url || cfg.callbackUrl,
  };
  return requestJson(cfg.initiatePath, requestPayload, options);
}

async function verifyTransaction(payload, options = {}) {
  const cfg = getConfig();
  return requestJson(cfg.verifyPath, payload, options);
}

function validateWebhookSignature(signatureHeader, rawBody) {
  const cfg = getConfig();
  if (!cfg.webhookSecret) {
    return true;
  }
  if (!signatureHeader || !rawBody) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', cfg.webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );
  } catch {
    return false;
  }
}

export { initiateCheckout, verifyTransaction, validateWebhookSignature };

