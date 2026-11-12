/**
 * SwalaSMS gateway (https://swalasms.com, docs.swalasms.com).
 *
 * Required config keys: api_key, sender_id
 * Auth: Authorization: Bearer <key>
 *   live keys start with "swl_live_", sandbox keys with "swl_test_"
 * Send one:  POST /v1/sms/messages   { recipient, sender_id, body }
 * Send many: POST /v2/sms/send-bulk  { recipients, message, sender_id }
 * Balance:   GET  /v1/balance
 * Senders:   GET  /v1/sender-ids
 */

import https from 'https';
import crypto from 'crypto';

const HOST = (process.env.SWALASMS_BASE_URL || 'https://api.swalasms.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');

function toE164(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `255${digits.slice(1)}`;
  else if (digits.length === 9) digits = `255${digits}`;
  return digits ? `+${digits}` : '';
}

function request(method, path, apiKey, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Idempotency-Key': crypto.randomUUID(),
      } : {}),
    };
    const req = https.request({ hostname: HOST, port: 443, path, method, headers }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = responseBody ? JSON.parse(responseBody) : null; } catch { parsed = null; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data: parsed ?? { raw: responseBody } });
          return;
        }
        const said = parsed?.message || parsed?.error || (responseBody ? responseBody.slice(0, 300) : `HTTP ${res.statusCode}`);
        resolve({ success: false, error: `SwalaSMS: ${said}`, data: parsed });
      });
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function credentials(config) {
  const apiKey = String(config?.api_key || '').trim();
  const senderId = String(config?.sender_id || config?.sender_name || '').trim();
  if (!apiKey || !senderId) return { error: 'SwalaSMS: API key and sender ID are required.' };
  return { apiKey, senderId };
}

async function sendSms(config, to, message) {
  const creds = credentials(config);
  if (creds.error) return { success: false, error: creds.error };
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map(toE164).filter(Boolean))];
  if (recipients.length === 0) return { success: false, error: 'SwalaSMS: no valid phone number.' };

  if (recipients.length === 1) {
    const result = await request('POST', '/v1/sms/messages', creds.apiKey, {
      recipient: recipients[0],
      sender_id: creds.senderId,
      body: message,
    });
    if (!result.success) return result;
    const status = String(result.data?.data?.status || '').toLowerCase();
    if (status === 'failed' || status === 'rejected') {
      return { success: false, error: result.data?.data?.failure_reason || 'SwalaSMS rejected this message.', data: result.data };
    }
    return result;
  }

  const result = await request('POST', '/v2/sms/send-bulk', creds.apiKey, {
    recipients,
    message,
    sender_id: creds.senderId,
    campaign_name: 'BizTrack',
  });
  if (!result.success) return result;
  const messages = result.data?.data?.messages || [];
  const accepted = messages.some((m) => !['failed', 'rejected'].includes(String(m.status || '').toLowerCase()));
  if (messages.length > 0 && !accepted) {
    return { success: false, error: messages[0]?.failure_reason || 'SwalaSMS rejected these numbers.', data: result.data };
  }
  return result;
}

async function getAccountStats(config) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const result = await request('GET', '/v1/balance', apiKey);
  if (!result.success) return result;
  const raw = result.data?.data?.balance;
  const balance = Number(raw);
  return { success: true, data: { balance: Number.isFinite(balance) ? balance : null } };
}

async function verifyCredentials(config) {
  return getAccountStats(config);
}

async function listSenderIds(config) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const result = await request('GET', '/v1/sender-ids', apiKey);
  if (!result.success) return result;
  const list = Array.isArray(result.data?.data) ? result.data.data : [];
  return {
    success: true,
    data: list.map((s) => ({ id: s.uid, name: s.sender_id, status: s.status })),
  };
}

function walletData(result) {
  return result?.data?.data ?? result?.data ?? {};
}

/** Markets, fixed packages and the ways a market can be paid. */
async function getWalletOptions(config, countryUid) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const query = countryUid ? `?country_uid=${encodeURIComponent(countryUid)}` : '';
  const packagesRes = await request('GET', `/v1/wallet/packages${query}`, apiKey);
  if (!packagesRes.success) return packagesRes;
  const d = walletData(packagesRes);
  const countries = d.countries || [];
  const selected = d.selected_country || countries.find((c) => c.uid === countryUid) || countries[0] || null;
  const country = countryUid || selected?.uid || selected?.country_uid || null;
  let paymentMethods = [];
  const methodsRes = await request('GET', `/v1/wallet/payment-methods${country ? `?country_uid=${encodeURIComponent(country)}` : ''}`, apiKey);
  if (methodsRes.success) {
    const list = walletData(methodsRes);
    paymentMethods = Array.isArray(list) ? list : (list.payment_methods || list.methods || []);
  }
  return {
    success: true,
    data: {
      countries,
      selected_country: selected,
      country_uid: country,
      packages: d.packages || [],
      tiers: d.tiers || [],
      payment_methods: paymentMethods,
    },
  };
}

async function quoteTopUp(config, { countryUid, units }) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const result = await request('POST', '/v1/wallet/quote', apiKey, { country_uid: countryUid, units: Number(units) });
  if (!result.success) return result;
  return { success: true, data: walletData(result) };
}

function readTopUp(result) {
  const d = walletData(result);
  const order = d.order || d;
  const payment = d.payment || null;
  return {
    orderUid: order.uid || null,
    reference: order.reference || null,
    units: order.units ?? null,
    amount: order.amount ?? null,
    currency: order.currency || null,
    status: order.status || null,
    sandbox: Boolean(order.sandbox || result.data?.mode === 'sandbox'),
    payment: payment ? {
      mode: payment.mode || null,
      status: payment.status || null,
      redirectUrl: payment.redirect_url || null,
      reference: payment.reference || null,
    } : null,
  };
}

async function createTopUp(config, { countryUid, units, packageUid, paymentGateway, billingPhone }) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const phone = billingPhone ? toE164(billingPhone) : '';
  const result = await request('POST', '/v1/wallet/topups', apiKey, {
    ...(countryUid ? { country_uid: countryUid } : {}),
    ...(packageUid ? { package_uid: packageUid } : { units: Number(units) }),
    payment_gateway: paymentGateway,
    ...(phone ? { billing_phone: phone } : {}),
  });
  if (!result.success) return result;
  return { success: true, data: readTopUp(result) };
}

async function getTopUp(config, orderUid) {
  const apiKey = String(config?.api_key || '').trim();
  if (!apiKey) return { success: false, error: 'SwalaSMS: API key is required.' };
  const result = await request('GET', `/v1/wallet/topups/${encodeURIComponent(orderUid)}`, apiKey);
  if (!result.success) return result;
  return { success: true, data: readTopUp(result) };
}

export { sendSms, getAccountStats, verifyCredentials, listSenderIds, getWalletOptions, quoteTopUp, createTopUp, getTopUp };
