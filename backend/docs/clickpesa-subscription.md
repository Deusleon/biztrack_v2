# ClickPesa Subscription Integration (Backend)

## 1. What was implemented

The backend now supports end-to-end SaaS subscription billing using ClickPesa with:
- Plan catalog (`monthly`, `quarterly`, and `annual` prices).
- Store-level subscription status tracking.
- Subscription transaction history.
- ClickPesa checkout creation.
- Idempotent webhook processing.
- Automatic activation/renewal after successful payment.
- SMS confirmation after successful payment.
- Automatic expiry and grace-period handling.
- Access control to block non-subscribed stores from protected APIs.
- Payment event logging into `system_logs`.

## 2. Database design

New migration: `DB/migrations/scripts/032_subscriptions.sql`

### New tables
- `subscription_plans`
- `store_subscriptions`
- `subscription_transactions`
- `payment_webhook_events`

### Notes
- `store_subscriptions` is store-level and unique by `store_id`.
- `billing_cycle` and `current_cycle` now allow `quarterly`.
- Full payment history is stored in `subscription_transactions`.
- Webhook idempotency is enforced with unique `(provider, event_id)` in `payment_webhook_events`.
- Starter plans are seeded during migration.
- Existing stores get an initial `inactive` subscription row.
- Subscription checkout requires a phone number and stores it against the transaction for confirmation SMS delivery.

## 3. Backend files added

- `utils/clickpesaClient.js`
: ClickPesa API wrapper (initiate + verify + signature check), timeout and retry support.

- `services/subscription.service.js`
: Core business logic (checkout, webhook processing, reconcile, access checks).

- `controllers/subscription.controller.js`
: HTTP handlers.

- `routes/subscription.routes.js`
: Subscription routes.

- `middlewares/subscriptionGuard.js`
: Access enforcement for expired/inactive subscriptions.

- `utils/smsService.js`
: Reused for sending a confirmation SMS after successful subscription payment.

## 4. Backend files updated

- `app.js`
: Added raw body capture for webhook signature verification and mounted `/api/subscriptions` routes.

- `middlewares/authMiddleware.js`
: Calls subscription enforcement after token validation (with exempt paths).

- `DB/seeds/permissionsList.js`
: Added `view_subscription` and `manage_subscription` permissions.

- `locales/en.json`, `locales/sw.json`
: Added subscription-related API messages.

## 5. API endpoints

Base: `/api/subscriptions`

### Protected endpoints (require auth)
- `GET /plans`
- `GET /me`
- `GET /history?limit=100`
- `POST /checkout`
- `POST /reconcile/:transactionId`

### Public webhook endpoint
- `POST /webhooks/clickpesa`

## 6. Access control behavior

Enforced in `subscriptionGuard` via `authMiddleware`:
- If store has active subscription: request continues.
- If active period ended but grace period still valid: status becomes `grace`, request continues.
- If no valid subscription: API returns `402` with code `subscription_required`.

Exempted paths include auth routes, subscription routes, and selected utility endpoints.

## 7. Edge cases handled

- Concurrent webhook hits:
  - idempotency via unique webhook event key.
  - transaction row lock (`FOR UPDATE`) during state transition.

- Duplicate payment notifications:
  - safely ignored once transaction already `paid`.

- Payment timeouts/network issues:
  - ClickPesa requests use timeout + retries.
  - failed initiation updates transaction status to `failed` and logs details.

- Missing phone number:
  - checkout is rejected before payment initiation.
  - the frontend also blocks submission.

- Manual reconciliation:
  - `POST /reconcile/:transactionId` verifies status against ClickPesa and applies update.
  - uses the best available provider/request reference if the provider response is incomplete.
  - sends the same SMS confirmation after a successful reconcile.

## 8. Environment variables

Add these to backend `.env`:

```env
CLICKPESA_BASE_URL=https://your-clickpesa-api
CLICKPESA_API_KEY=your_api_key
CLICKPESA_API_SECRET=your_api_secret
CLICKPESA_WEBHOOK_SECRET=your_webhook_hmac_secret
CLICKPESA_INITIATE_PATH=/api/v1/checkout
CLICKPESA_VERIFY_PATH=/api/transactions/verify
CLICKPESA_CALLBACK_URL=https://your-backend-domain/api/subscriptions/webhooks/clickpesa
SUBSCRIPTION_GRACE_DAYS=0
```

## 9. How to customize safely

- Change plan pricing/details:
  - update rows in `subscription_plans`.
  - quarterly billing is calculated as 3x the monthly price unless you add a dedicated quarterly column later.

- Add new plan constraints/features:
  - use `subscription_plans.metadata` JSONB.

- Adjust grace-period policy:
  - set `SUBSCRIPTION_GRACE_DAYS`.

- Adjust webhook mapping fields from ClickPesa payload:
  - edit parsing in `processWebhook` in `services/subscription.service.js`.

- Change access control exemptions:
  - edit `EXEMPT_PREFIXES` in `middlewares/subscriptionGuard.js`.

## 10. Deployment checklist

1. Run migration:
   - `npm run migrate`
2. Sync permissions:
   - `npm run permissions:sync`
3. Assign new permissions to intended roles.
4. Configure ClickPesa credentials in `.env`.
5. Set webhook URL in ClickPesa dashboard.
6. Test full flow:
   - checkout creation
   - successful webhook callback
   - expired subscription blocking
   - manual reconcile path
