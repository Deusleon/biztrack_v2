-- =====================================================
-- Migration 032: SaaS Subscriptions (ClickPesa)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    monthly_amount NUMERIC(12,2) NOT NULL CHECK (monthly_amount >= 0),
    annual_amount NUMERIC(12,2) NOT NULL CHECK (annual_amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL,
    plan_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'pending', 'active', 'grace', 'expired', 'cancelled')),
    current_cycle VARCHAR(20) CHECK (current_cycle IN ('monthly', 'quarterly', 'annual')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ,
    last_payment_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_reason TEXT,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT store_subscriptions_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT store_subscriptions_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    CONSTRAINT store_subscriptions_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT store_subscriptions_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.subscription_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL,
    store_id UUID,
    subscription_id UUID,
    plan_id UUID,
    provider VARCHAR(40) NOT NULL DEFAULT 'clickpesa',
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
    status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
    payment_method VARCHAR(40),
    phone_number VARCHAR(30),
    request_id VARCHAR(120) NOT NULL UNIQUE,
    provider_transaction_id VARCHAR(120),
    provider_reference VARCHAR(120),
    checkout_url TEXT,
    raw_request JSONB,
    raw_response JSONB,
    paid_at TIMESTAMPTZ,
    failed_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_transactions_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT subscription_transactions_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL,
    CONSTRAINT subscription_transactions_subscription_id_fkey
        FOREIGN KEY (subscription_id) REFERENCES public.store_subscriptions(id) ON DELETE SET NULL,
    CONSTRAINT subscription_transactions_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    CONSTRAINT subscription_transactions_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_transactions_provider_reference
ON public.subscription_transactions(provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    event_type VARCHAR(80),
    signature TEXT,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_webhook_events_provider_event_unique UNIQUE (provider, event_id)
);

INSERT INTO public.subscription_plans (code, name, description, monthly_amount, annual_amount, currency, metadata)
VALUES
    ('STARTER', 'Starter', 'Starter SaaS plan', 35000, 350000, 'TZS', '{"maxUsers": 5, "maxStores": 1}'),
    ('BUSINESS', 'Business', 'Business SaaS plan', 75000, 750000, 'TZS', '{"maxUsers": 20, "maxStores": 5}'),
    ('ENTERPRISE', 'Enterprise', 'Enterprise SaaS plan', 150000, 1500000, 'TZS', '{"maxUsers": 999, "maxStores": 999}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.store_subscriptions (account_id, status)
SELECT DISTINCT s.owner_id, 'inactive'
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_store_subscriptions_status ON public.store_subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_subscriptions_account_unique ON public.store_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_account_status ON public.store_subscriptions(account_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_account_created ON public.subscription_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_status ON public.subscription_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created ON public.payment_webhook_events(created_at DESC);

DROP TRIGGER IF EXISTS trigger_update_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trigger_update_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_store_subscriptions_updated_at ON public.store_subscriptions;
CREATE TRIGGER trigger_update_store_subscriptions_updated_at
    BEFORE UPDATE ON public.store_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_subscription_transactions_updated_at ON public.subscription_transactions;
CREATE TRIGGER trigger_update_subscription_transactions_updated_at
    BEFORE UPDATE ON public.subscription_transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
