import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import _m10 from '../services/subscription.service.js';
const { 
  getPlans,
  getStoreSubscription,
  getStoreTransactionHistory,
  createCheckout,
  processWebhook,
  reconcileTransaction,
  listManualSubscriptionStores,
  recordManualSubscription,
 } = _m10;
import { validateWebhookSignature } from '../utils/clickpesaClient.js';
const _exp_getPlans = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  try {
    const plans = await getPlans();
    return res.status(200).json({
      message: t('subscriptions_plans_fetched', lang),
      plans,
    });
  } catch (error) {
    console.error('Get subscription plans error:', error.message);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getMySubscription = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  const storeId = req.user?.current_store_id;

  try {
    const accountId = storeId;

    if (!accountId) {
      return respondWithError(req, res, 400, 'store_id_required');
    }

    const subscription = await getStoreSubscription(accountId);
    return res.status(200).json({
      message: t('subscription_status_fetched', lang),
      subscription,
    });
  } catch (error) {
    console.error('Get my subscription error:', error.message);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getMyTransactions = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  const storeId = req.user?.current_store_id;

  try {
    const accountId = storeId;

    if (!accountId) {
      return respondWithError(req, res, 400, 'store_id_required');
    }

    const history = await getStoreTransactionHistory(accountId, req.query.limit);
    return res.status(200).json({
      message: t('subscription_history_fetched', lang),
      transactions: history,
    });
  } catch (error) {
    console.error('Get subscription history error:', error.message);
    return respondWithError(req, res, 500, 'server_error');
  }
};

const _exp_createCheckout = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  const storeId = req.user?.current_store_id;
  const userId = req.user?.id;
  const {
    planCode,
    billingCycle,
    months,
    phoneNumber,
    customerName,
    customerEmail,
  } = req.body;

  if (!planCode) {
    return res.status(400).json({ message: t('subscription_plan_required', lang) });
  }

  try {

    const checkout = await createCheckout({
      // accountId,
      storeId,
      userId,
      planCode,
      billingCycle,
      months,
      phoneNumber,
      customerName,
      customerEmail,
    });

    return res.status(201).json({
      message: t('subscription_checkout_created', lang),
      checkout,
    });
  } catch (error) {
    console.error('Create subscription checkout error:', error.message);

    if (error.code === 'PHONE_REQUIRED') {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    if (error.code === 'PLAN_NOT_FOUND') {
      return res.status(404).json({ message: t('subscription_plan_not_found', lang) });
    }

    if (error.code === 'STORE_NOT_FOUND') {
      return res.status(404).json({ message: t('store_not_found', lang) });
    }

    if (error.code === 'CLICKPESA_TIMEOUT') {
      return res.status(504).json({ message: t('payment_gateway_timeout', lang) });
    }
    console.error('Create checkout error details:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const clickpesaWebhook = async (req, res) => {
  try {
    // console.log('Webhook parsed body:', req.body);
    const result = await processWebhook(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('ClickPesa webhook error:', error.message);
    return res.status(500).json({ success: false, message: 'webhook_processing_failed' });
  }
};

export const verifyTransaction = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  const { transactionId } = req.params;

  if (!transactionId) {
    return res.status(400).json({ message: t('subscription_transaction_required', lang) });
  }

  try {
    const result = await reconcileTransaction(transactionId);
    return res.status(200).json({
      message: t('subscription_verify_success', lang),
      result,
    });
  } catch (error) {
    console.error('Subscription verify error:', error.message);

    if (error.code === 'TX_NOT_FOUND') {
      return res.status(404).json({ message: t('subscription_transaction_not_found', lang) });
    }

    return respondWithError(req, res, 500, 'server_error');
  }
};
export const listManualStores = async (req, res) => {
  try {
    const stores = await listManualSubscriptionStores();
    return res.status(200).json({ stores });
  } catch (error) {
    console.error('List manual subscription stores error:', error.message);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const recordManualPayment = async (req, res) => {
  const lang = req.user?.lang || req.headers['x-language'] || 'en';
  const { storeId, planCode, billingCycle, months, paymentMethod, reference, phoneNumber, note } = req.body || {};

  if (!storeId) return res.status(400).json({ message: t('store_required', lang) });
  if (!planCode) return res.status(400).json({ message: t('subscription_plan_required', lang) });

  try {
    const result = await recordManualSubscription({
      storeId,
      userId: req.user.id,
      planCode,
      billingCycle,
      months,
      paymentMethod,
      reference,
      phoneNumber,
      note,
    });
    const date = result.subscription?.ends_at
      ? new Date(result.subscription.ends_at).toLocaleDateString('en-GB')
      : '';
    return res.status(201).json({
      message: t('manual_subscription_recorded', { date }, lang),
      subscription: result.subscription,
      quote: result.quote,
    });
  } catch (error) {
    console.error('Record manual subscription error:', error.message);
    if (error.code === 'STORE_NOT_FOUND') return res.status(404).json({ message: t('store_not_found', lang) });
    if (error.code === 'PLAN_NOT_FOUND') return res.status(404).json({ message: t('subscription_plan_not_found', lang) });
    if (error.code === 'REFERENCE_REQUIRED') return res.status(400).json({ message: t('payment_reference_required', lang) });
    if (error.code === 'INVALID_METHOD') return res.status(400).json({ message: t('invalid_payment_method', lang) });
    if (error.code === 'PHONE_INVALID') return res.status(400).json({ message: t('invalid_phone_number', lang) });
    if (error.code === 'DUPLICATE_REFERENCE') return res.status(409).json({ message: t('duplicate_payment_reference', lang) });
    return respondWithError(req, res, 500, 'server_error');
  }
};

export { _exp_getPlans as getPlans };
export { _exp_createCheckout as createCheckout };
