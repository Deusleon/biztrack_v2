import crypto from 'crypto';
import pool from '../config/db.js';
import { initiateCheckout, verifyTransaction } from '../utils/clickpesaClient.js';
import { t } from '../utils/translate.js';
import { emitToStore, emitToUser } from '../utils/socket.js';
import * as smsService from '../utils/smsService.js';
import { TtlCache } from '../utils/ttlCache.js';
const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 0);

function normalizeBillingCycle(value) {
  if (value === 'annual') return 'annual';
  if (value === 'quarterly') return 'quarterly';
  return 'monthly';
}

function generateRef() {
  const base36 = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(1).toString('hex').toUpperCase(); // 2 chars

  return `BTS${base36}${random}`;
}

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber || '').replace(/\s+/g, '');
}

function normalizePaymentStatus(raw) {
  const value = String(raw || '').toLowerCase();
  if (['paid', 'success', 'successful', 'completed', 'complete'].includes(value)) {
    return 'paid';
  }
  if (['failed', 'declined', 'error'].includes(value)) {
    return 'failed';
  }
  if (['expired', 'timeout'].includes(value)) {
    return 'expired';
  }
  if (['cancelled', 'canceled'].includes(value)) {
    return 'cancelled';
  }
  return 'pending';
}

async function logPaymentEvent(client, { userId, storeId, action, payload }) {
  await client.query(
    `INSERT INTO system_logs (user_id, action, description, store_id)
     VALUES ($1, $2, $3, $4)`,
    [userId || null, action, JSON.stringify(payload || {}), storeId || null]
  );
}

async function markSubscriptionExpiry(accountId) {
  await pool.query(
    `UPDATE store_subscriptions
     SET status = 'expired', updated_at = NOW()
     WHERE account_id = $1
       AND status IN ('active', 'grace')
       AND COALESCE(grace_ends_at, ends_at) IS NOT NULL
       AND COALESCE(grace_ends_at, ends_at) < NOW()`,
    [accountId]
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Guard cache
//
// ensureSubscriptionAccess() runs on EVERY authenticated request. Before, each
// run did an UPDATE (markSubscriptionExpiry) plus a SELECT. The subscription
// row now is cached for a short time and the allow/deny decision is still
// re-evaluated against the current time on every request, so an expiry or
// grace period is noticed on time. The database is only touched again when:
//   - the cache entry is older than SUBSCRIPTION_CACHE_TTL_MS, or
//   - the cached row has just crossed an expiry boundary (needs the UPDATE), or
//   - something in this process changed subscriptions (cache cleared).
// SUBSCRIPTION_CACHE_TTL_MS=0 turns the cache off.
// ─────────────────────────────────────────────────────────────────────────
const SUBSCRIPTION_CACHE_TTL_MS =
  process.env.SUBSCRIPTION_CACHE_TTL_MS !== undefined && process.env.SUBSCRIPTION_CACHE_TTL_MS !== ''
    && Number.isFinite(Number(process.env.SUBSCRIPTION_CACHE_TTL_MS))
    ? Number(process.env.SUBSCRIPTION_CACHE_TTL_MS)
    : 30_000;
const guardCache = new TtlCache({ ttlMs: SUBSCRIPTION_CACHE_TTL_MS });

function invalidateSubscriptionCache() {
  guardCache.clear();
}

// Mirrors the WHERE clause of markSubscriptionExpiry(): true when that UPDATE
// would now change this row to 'expired'.
function rowNeedsExpiryMark(row, now = new Date()) {
  if (!row || (row.status !== 'active' && row.status !== 'grace')) return false;
  const boundary = row.grace_ends_at || row.ends_at;
  if (!boundary) return false;
  return new Date(boundary) < now;
}

async function getSubscriptionForGuard(accountId) {
  const key = String(accountId);
  const cached = guardCache.get(key);
  if (cached !== undefined && !rowNeedsExpiryMark(cached)) {
    return cached;
  }
  const fresh = await getStoreSubscription(accountId);
  guardCache.set(key, fresh);
  return fresh;
}

// Wraps a function that changes subscriptions so the guard cache is cleared
// after it finishes (the transaction has committed by then).
function clearGuardCacheAfter(fn) {
  return async function wrapped(...args) {
    try {
      return await fn.apply(this, args);
    } finally {
      invalidateSubscriptionCache();
    }
  };
}

async function getPlans() {
  const { rows } = await pool.query(
    `SELECT id, code, name, description, monthly_amount, annual_amount, currency, is_active, metadata
     FROM subscription_plans
     WHERE is_active = true
     ORDER BY monthly_amount ASC`
  );
  return rows;
}

async function getStoreSubscription(accountId) {
  await markSubscriptionExpiry(accountId);

  const { rows } = await pool.query(
    `SELECT ss.id, ss.account_id, ss.status, ss.current_cycle, ss.starts_at, ss.ends_at, ss.grace_ends_at,
            ss.last_payment_at, ss.cancelled_at, ss.auto_renew,
            sp.id AS plan_id, sp.code AS plan_code, sp.name AS plan_name,
            sp.monthly_amount, sp.annual_amount, sp.currency
     FROM store_subscriptions ss
     LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
     WHERE ss.account_id = $1
     ORDER BY ss.updated_at DESC NULLS LAST, ss.created_at DESC
     LIMIT 1`,
    [accountId]
  );

  return rows[0] || null;
}

async function getStoreTransactionHistory(accountId, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT st.id, st.status, st.billing_cycle, st.amount, st.currency, st.payment_method,
            st.phone_number, st.provider, st.provider_reference, st.request_id,
            st.checkout_url, st.paid_at, st.failed_reason, st.raw_request, st.created_at,
            sp.code AS plan_code, sp.name AS plan_name
     FROM subscription_transactions st
     LEFT JOIN subscription_plans sp ON sp.id = st.plan_id
     WHERE st.account_id = $1
     ORDER BY st.created_at DESC
     LIMIT $2`,
    [accountId, safeLimit]
  );

  return rows;
}

async function getTransactionSnapshot(transactionId) {
  const { rows } = await pool.query(
    `SELECT st.id, st.account_id, st.store_id, st.subscription_id, st.status, st.billing_cycle, st.amount, st.currency,
            st.payment_method, st.phone_number, st.provider, st.provider_reference,
            st.provider_transaction_id, st.request_id, st.checkout_url, st.paid_at,
            st.failed_reason, st.raw_request, st.created_at, st.updated_at,
            sp.code AS plan_code, sp.name AS plan_name
     FROM subscription_transactions st
     LEFT JOIN subscription_plans sp ON sp.id = st.plan_id
     WHERE st.id = $1
     LIMIT 1`,
    [transactionId]
  );

  return rows[0] || null;
}

async function emitSubscriptionPaymentUpdate({
  accountId,
  storeId,
  transactionId,
  status,
  eventId = null,
  source,
}) {
  try {
    const [subscription, transaction] = await Promise.all([
      getStoreSubscription(accountId),
      getTransactionSnapshot(transactionId),
    ]);

    const payload = {
      eventId,
      source,
      accountId,
      storeId,
      status,
      transaction,
      subscription,
      processedAt: new Date().toISOString(),
    };

    emitToUser(accountId, 'subscriptionPaymentUpdated', payload);

    if (storeId) {
      emitToStore(storeId, 'subscriptionPaymentUpdated', payload);
    }
  } catch (error) {
    console.error('Emit subscription payment update error:', error.message);
  }
}

function quotePrepaidMonths(monthlyAmount, months) {
  const count = Math.min(24, Math.max(1, Math.round(Number(months) || 1)));
  const gross = (Number(monthlyAmount) || 0) * count;
  const rate = count >= 12 ? 0.15 : count >= 6 ? 0.1 : 0;
  const discount = Math.round(gross * rate);
  return { months: count, gross, rate, discount, amount: gross - discount };
}

/** A year is the monthly price times 12, then 15% off. */
function quoteAnnual(monthlyAmount) {
  const gross = (Number(monthlyAmount) || 0) * 12;
  const rate = 0.15;
  const discount = Math.round(gross * rate);
  return { months: 12, gross, rate, discount, amount: gross - discount };
}

async function createCheckout({
  storeId,
  userId,
  planCode,
  billingCycle,
  months,
  phoneNumber,
  customerName,
  customerEmail,
}) {
  const cycle = normalizeBillingCycle(billingCycle);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    const err = new Error('Phone number is required');
    err.code = 'PHONE_REQUIRED';
    throw err;
  }

  const planResult = await pool.query(
    `SELECT id, code, name, monthly_amount, annual_amount, currency, is_active
     FROM subscription_plans
     WHERE code = $1 AND is_active = true
     LIMIT 1`,
    [planCode]
  );

  if (planResult.rows.length === 0) {
    const err = new Error('Subscription plan not found');
    err.code = 'PLAN_NOT_FOUND';
    throw err;
  }

  const plan = planResult.rows[0];
  const quoted = cycle === 'annual'
    ? quoteAnnual(plan.monthly_amount)
    : quotePrepaidMonths(plan.monthly_amount, cycle === 'quarterly' ? 3 : months);
  const prepaidMonths = quoted.months;
  const amount = quoted.amount;
  const requestId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const storeResult = await client.query(
      'SELECT id, name FROM stores WHERE id = $1 LIMIT 1',
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      const err = new Error('Store not found');
      err.code = 'STORE_NOT_FOUND';
      throw err;
    }

    // Lock the current subscription row to avoid concurrent checkout races.
    const currentSubscription = await client.query(
      'SELECT id FROM store_subscriptions WHERE account_id = $1 FOR UPDATE',
      [storeId]
    );

    let subscriptionId;
    if (currentSubscription.rows.length === 0) {
      const createdSub = await client.query(
        `INSERT INTO store_subscriptions (account_id, plan_id, status, current_cycle, created_by, updated_by)
         VALUES ($1, $2, 'inactive', $3, $4, $4)
         RETURNING id`,
        [storeId, plan.id, cycle, userId]
      );
      subscriptionId = createdSub.rows[0].id;
    } else {
      subscriptionId = currentSubscription.rows[0].id;
      await client.query(
        `UPDATE store_subscriptions
         SET plan_id = $1, current_cycle = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $4`,
        [plan.id, cycle, userId, subscriptionId]
      );
    }

    const createdTransaction = await client.query(
      `INSERT INTO subscription_transactions (
          account_id, store_id, subscription_id, plan_id, billing_cycle, amount, currency,
          status, phone_number, request_id, created_by, raw_request
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'initiated', $8, $9, $10, $11)
       RETURNING *`,
      [
        storeId,
        storeId,
        subscriptionId,
        plan.id,
        cycle,
        amount,
        plan.currency || 'TZS',
        normalizedPhoneNumber,
        requestId,
        userId,
        JSON.stringify({ planCode: plan.code, billingCycle: cycle, months: prepaidMonths, gross: quoted.gross, discount: quoted.discount, discountRate: quoted.rate }),
      ]
    );

    const transactionId = createdTransaction.rows[0].id;
    const orderReference = createdTransaction.rows[0].phone_number;

    await logPaymentEvent(client, {
      userId,
      storeId,
      action: 'subscription_payment_initiated',
      payload: {
        transactionId,
        planCode: plan.code,
        billingCycle: cycle,
        amount,
      },
    });

    await client.query('COMMIT');

    let clickPesaResponse;
    try {
      clickPesaResponse = await initiateCheckout(
        {
          amount,
          currency: plan.currency || 'TZS',
          customer_name: customerName,
          customer_email: customerEmail,
          phoneNumber: normalizedPhoneNumber,
          orderReference: generateRef(),
          merchant_reference: requestId,
          fetchSenderDetails: false,
          description: `${plan.name} ${cycle} subscription`,
          metadata: {
            store_id: storeId,
            account_id: storeId,
            plan_code: plan.code,
            billing_cycle: cycle,
            transaction_id: transactionId,
          },
        },
        { idempotencyKey: requestId }
      );
    } catch (error) {
      await pool.query(
        `UPDATE subscription_transactions
         SET status = 'failed', failed_reason = $1, updated_at = NOW()
         WHERE id = $2`,
        [error.message, transactionId]
      );

      await pool.query(
        `INSERT INTO system_logs (user_id, action, description, store_id)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          'subscription_payment_failed',
          JSON.stringify({ transactionId, reason: error.message }),
          storeId,
        ]
      );

      throw error;
    }
    const providerReference = clickPesaResponse?.orderReference || null;

    const providerTransactionId = clickPesaResponse?.id || providerReference;

    await pool.query(
      `UPDATE subscription_transactions
       SET status = 'pending',
           provider_reference = $1,
           provider_transaction_id = $2,
           raw_response = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [providerReference, providerTransactionId, clickPesaResponse, transactionId]
    );

    return {
      transactionId,
      requestId,
      providerReference,
      providerTransactionId,
      amount,
      currency: plan.currency || 'TZS',
      billingCycle: cycle,
      plan,
      providerResponse: clickPesaResponse,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function applySuccessfulPayment({
  client,
  transaction,
  providerReference,
  paymentMethod,
  rawResponse,
}) {
  if (transaction.status === 'paid') {
    return { alreadyPaid: true };
  }

  let paidMonths = 1;
  try {
    const raw = typeof transaction.raw_request === 'string' ? JSON.parse(transaction.raw_request) : transaction.raw_request;
    const n = Math.round(Number(raw?.months));
    if (n >= 1 && n <= 24) paidMonths = n;
  } catch { /* older payments have no month count */ }
  const durationMonths =
    transaction.billing_cycle === 'annual'
      ? 12
      : transaction.billing_cycle === 'quarterly'
        ? 3
        : paidMonths;

  const existingSubResult = await client.query(
    `SELECT * FROM store_subscriptions
     WHERE account_id = $1
     FOR UPDATE`,
    [transaction.account_id]
  );

  const existingSub = existingSubResult.rows[0] || null;

  let baseDate = new Date();
  if (existingSub?.status === 'active' && existingSub?.ends_at) {
    const existingEnd = new Date(existingSub.ends_at);
    if (existingEnd > baseDate) {
      baseDate = existingEnd;
    }
  }

  const startsAt = new Date();
  const endsAt = new Date(baseDate);
  endsAt.setMonth(endsAt.getMonth() + durationMonths);

  const graceEndsAt = new Date(endsAt);
  graceEndsAt.setDate(graceEndsAt.getDate() + Math.max(GRACE_DAYS, 0));

  let subscriptionId = existingSub?.id;
  if (!subscriptionId) {
    const createdSub = await client.query(
      `INSERT INTO store_subscriptions (
        account_id, plan_id, status, current_cycle, starts_at, ends_at, grace_ends_at,
        last_payment_at, created_by, updated_by
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, NOW(), $7, $7)
      RETURNING id`,
      [
        transaction.account_id,
        transaction.plan_id,
        transaction.billing_cycle,
        startsAt,
        endsAt,
        graceEndsAt,
        transaction.created_by,
      ]
    );
    subscriptionId = createdSub.rows[0].id;
  } else {
    await client.query(
      `UPDATE store_subscriptions
       SET plan_id = $1,
           status = 'active',
           current_cycle = $2,
           starts_at = CASE WHEN starts_at IS NULL THEN $3 ELSE starts_at END,
           ends_at = $4,
           grace_ends_at = $5,
           last_payment_at = NOW(),
           cancelled_at = NULL,
           cancelled_reason = NULL,
           updated_at = NOW(),
           updated_by = $6
       WHERE id = $7`,
      [
        transaction.plan_id,
        transaction.billing_cycle,
        startsAt,
        endsAt,
        graceEndsAt,
        transaction.created_by,
        subscriptionId,
      ]
    );
  }

  await client.query(
    `UPDATE subscription_transactions
     SET status = 'paid',
         paid_at = NOW(),
         provider_reference = COALESCE($1, provider_reference),
         payment_method = COALESCE($2, payment_method),
         raw_response = $3,
         failed_reason = NULL,
         subscription_id = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [providerReference, paymentMethod, rawResponse || null, subscriptionId, transaction.id]
  );

  await logPaymentEvent(client, {
    userId: transaction.created_by,
    storeId: transaction.store_id,
    action: 'subscription_payment_success',
    payload: {
      transactionId: transaction.id,
      subscriptionId,
      status: 'active',
      endsAt,
    },
  });

  const subscriptionSnapshot = await client.query(
    `SELECT ss.*, sp.name AS plan_name, sp.code AS plan_code
     FROM store_subscriptions ss
     LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
     WHERE ss.id = $1
     LIMIT 1`,
    [subscriptionId]
  );

  return { alreadyPaid: false, subscriptionId, endsAt, subscription: subscriptionSnapshot.rows[0] || null };
}

async function markFailedPayment({ client, transaction, normalizedStatus, rawResponse }) {
  await client.query(
    `UPDATE subscription_transactions
     SET status = $1,
         raw_response = $2,
         failed_reason = COALESCE($3, failed_reason),
         updated_at = NOW()
     WHERE id = $4`,
    [
      ['failed', 'expired', 'cancelled'].includes(normalizedStatus) ? normalizedStatus : 'failed',
      rawResponse || null,
      rawResponse?.message || rawResponse?.error || null,
      transaction.id,
    ]
  );

  await logPaymentEvent(client, {
    userId: transaction.created_by,
    storeId: transaction.store_id,
    action: 'subscription_payment_failed',
    payload: {
      transactionId: transaction.id,
      status: normalizedStatus,
      reason: rawResponse?.message || rawResponse?.error || null,
    },
  });
}

function formatSubscriptionSuccessMessage(subscription, transaction) {
  const planName = subscription?.plan_name.toUpperCase();
  const expiryDate = subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString('en-GB') : 'N/A';
  const amount = Number(transaction.amount || 0).toLocaleString('en-TZ', {
    maximumFractionDigits: 0,
  });

  const message = t('subscription_payment_success', {
    amount,
    currency: transaction.currency || 'TZS',
    planName,
    expiryDate,
  });
  return message;
}

async function sendSubscriptionSuccessNotification({ subscription, transaction }) {
  const phone = normalizePhoneNumber(transaction.phone_number);
  if (!phone) {
    return { success: false, skipped: true, reason: 'missing_phone' };
  }

  const message = formatSubscriptionSuccessMessage(subscription, transaction);
  const result = await smsService.send(phone, message);

  if (!result.success) {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [
        transaction.created_by || null,
        'subscription_notification_failed',
        JSON.stringify({ transactionId: transaction.id, phone, error: result.error }),
        transaction.store_id,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)` ,
      [
        transaction.created_by || null,
        'subscription_notification_sent',
        JSON.stringify({ transactionId: transaction.id, phone, gateway: result.gateway || null }),
        transaction.store_id,
      ]
    );
  }

  return result;
}

function formatSubscriptionFailureMessage(subscription, transaction) {
  const planName = subscription?.plan_name.toUpperCase();
  const expiryDate = subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString('en-GB') : 'N/A';
  const amount = Number(transaction.amount || 0).toLocaleString('en-TZ', {
    maximumFractionDigits: 0,
  });

  const message = t('subscription_payment_failed', {
    amount,
    currency: transaction.currency || 'TZS',
    planName,
    expiryDate,
  });
  return message;
}

async function sendSubscriptionFailureNotification({ subscription, transaction }) {
  const phone = normalizePhoneNumber(transaction.phone_number);
  if (!phone) {
    return { success: false, skipped: true, reason: 'missing_phone' };
  }

  const message = formatSubscriptionFailureMessage(subscription, transaction);
  const result = await smsService.send(phone, message);

  if (!result.success) {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [
        transaction.created_by || null,
        'subscription_notification_failed',
        JSON.stringify({ transactionId: transaction.id, phone, error: result.error }),
        transaction.store_id,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)` ,
      [
        transaction.created_by || null,
        'subscription_notification_sent',
        JSON.stringify({ transactionId: transaction.id, phone, gateway: result.gateway || null }),
        transaction.store_id,
      ]
    );
  }

  return result;
}

const webhookLooks = new Map();
async function processWebhook(payload) {
  const eventId = payload?.data?.id;
  const eventType = payload?.event;
  const normalizedStatus = normalizePaymentStatus(payload?.data?.status);

  const webhookInsert = await pool.query(
    `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload)
     VALUES ('clickpesa', $1, $2, $3)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [eventId, eventType, payload || {}]
  );

  if (webhookInsert.rows.length === 0) {
    return { duplicate: true, eventId };
  }

  const transactionRef = payload?.data?.orderReference || null;

  if (!transactionRef) {
    await pool.query(
      `UPDATE payment_webhook_events
       SET status = 'failed', error_message = 'Missing transaction reference', processed_at = NOW()
       WHERE provider = 'clickpesa' AND event_id = $1`,
      [eventId]
    );
    return { eventId, processed: false, reason: 'missing_reference' };
  }

  // The webhook is only a TRIGGER. Anybody can POST to this public address, so nothing in the notice is trusted (its status least of all):
  // the real status is always read from ClickPesa by reconcileTransaction(). (The original applied the payment straight from the
  // notice, so a forged "paid" notice for a known transaction id gave a free subscription.)
  const found = await pool.query(
    `SELECT id FROM subscription_transactions
     WHERE id::text = $1 OR request_id = $1 OR provider_reference = $1
     ORDER BY created_at DESC LIMIT 1`,
    [transactionRef]
  );
  if (found.rows.length === 0) {
    await pool.query(
      `UPDATE payment_webhook_events SET status = 'failed', error_message = 'Transaction not found', processed_at = NOW()
       WHERE provider = 'clickpesa' AND event_id = $1`,
      [eventId]
    );
    return { eventId, processed: false, reason: 'transaction_not_found' };
  }
  const transactionId = found.rows[0].id;
  // do not let a stream of notices hammer the payment provider: one look per transaction every 5 seconds
  const last = webhookLooks.get(transactionId) || 0;
  if (Date.now() - last < 5000) {
    await pool.query("UPDATE payment_webhook_events SET status = 'processed', processed_at = NOW() WHERE provider = 'clickpesa' AND event_id = $1", [eventId]);
    return { eventId, processed: false, reason: 'throttled' };
  }
  webhookLooks.set(transactionId, Date.now());
  try {
    const verified = await reconcileTransaction(transactionId);
    await pool.query("UPDATE payment_webhook_events SET status = 'processed', processed_at = NOW() WHERE provider = 'clickpesa' AND event_id = $1", [eventId]);
    return { eventId, processed: true, status: verified.status };
  } catch (error) {
    await pool.query("UPDATE payment_webhook_events SET status = 'failed', error_message = $2, processed_at = NOW() WHERE provider = 'clickpesa' AND event_id = $1", [eventId, String(error.message).slice(0, 300)]);
    throw error;
  }
}

async function reconcileTransaction(transactionId) {
  const result = await pool.query(
    `SELECT * FROM subscription_transactions WHERE id = $1 LIMIT 1`,
    [transactionId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Transaction not found');
    err.code = 'TX_NOT_FOUND';
    throw err;
  }

  const transaction = result.rows[0];
  if (transaction.status === 'paid') {
    return { status: 'paid', alreadyPaid: true };
  }

  const verificationReference =
    transaction.provider_transaction_id ||
    transaction.provider_reference;

  const verifyResponse = await verifyTransaction({
    transaction_id: verificationReference,
    reference: verificationReference,
    merchant_reference: transaction.request_id,
    external_reference: transaction.id,
  });

  const status = normalizePaymentStatus(
    verifyResponse?.status || verifyResponse?.payment_status || verifyResponse?.data?.status
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let paymentResult = null;

    const lockedTransaction = await client.query(
      'SELECT * FROM subscription_transactions WHERE id = $1 FOR UPDATE',
      [transactionId]
    );

    if (lockedTransaction.rows.length === 0) {
      throw new Error('Transaction not found during verification');
    }

    if (status === 'paid') {
      paymentResult = await applySuccessfulPayment({
        client,
        transaction: lockedTransaction.rows[0],
        providerReference:
          verifyResponse?.transaction_id || verifyResponse?.reference || transaction.provider_reference,
        paymentMethod: verifyResponse?.payment_method || verifyResponse?.channel || null,
        rawResponse: verifyResponse,
      });
    } else {
      await markFailedPayment({
        client,
        transaction: lockedTransaction.rows[0],
        normalizedStatus: status,
        rawResponse: verifyResponse,
      });
    }

    await client.query('COMMIT');

    await emitSubscriptionPaymentUpdate({
      accountId: transaction.account_id,
      storeId: transaction.store_id,
      transactionId: transaction.id,
      status,
      source: 'reconcile',
    });

    if (status === 'paid') {
      try {
        await sendSubscriptionSuccessNotification({
          subscription: (await getStoreSubscription(transaction.account_id)) || paymentResult?.subscription || null,
          transaction,
        });
      } catch (notifyError) {
        console.error('Subscription SMS notification error:', notifyError.message);
      }
    }

    return {
      status,
      verified: true,
      providerResponse: verifyResponse,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSubscriptionAccess(accountId) {
  const subscription = await getSubscriptionForGuard(accountId);
  if (!subscription) {
    return {
      allowed: false,
      reason: 'no_subscription',
      subscription: null,
    };
  }

  const now = new Date();
  const endsAt = subscription.ends_at ? new Date(subscription.ends_at) : null;
  const graceEndsAt = subscription.grace_ends_at ? new Date(subscription.grace_ends_at) : null;

  if (subscription.status === 'active') {
    if (endsAt && endsAt < now) {
      if (graceEndsAt && graceEndsAt > now) {
        await pool.query(
          `UPDATE store_subscriptions
           SET status = 'grace', updated_at = NOW()
           WHERE account_id = $1`,
          [accountId]
        );
        invalidateSubscriptionCache();
        return {
          allowed: true,
          reason: 'grace',
          subscription: { ...subscription, status: 'grace' },
        };
      }
      await pool.query(
        `UPDATE store_subscriptions
         SET status = 'expired', updated_at = NOW()
         WHERE account_id = $1`,
        [accountId]
      );
      invalidateSubscriptionCache();
      return {
        allowed: false,
        reason: 'expired',
        subscription: { ...subscription, status: 'expired' },
      };
    }

    return { allowed: true, reason: 'active', subscription };
  }

  if (subscription.status === 'grace' && graceEndsAt && graceEndsAt > now) {
    return { allowed: true, reason: 'grace', subscription };
  }

  return {
    allowed: false,
    reason: subscription.status || 'inactive',
    subscription,
  };
}

export default {
  getPlans,
  getStoreSubscription,
  getStoreTransactionHistory,
  createCheckout: clearGuardCacheAfter(createCheckout),
  processWebhook: clearGuardCacheAfter(processWebhook),
  reconcileTransaction: clearGuardCacheAfter(reconcileTransaction),
  ensureSubscriptionAccess,
  invalidateSubscriptionCache,
};
