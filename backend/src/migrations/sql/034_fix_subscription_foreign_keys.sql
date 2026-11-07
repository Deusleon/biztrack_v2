BEGIN;

-- Delete old subscription-related data
DELETE FROM public.subscription_transactions;
DELETE FROM public.store_subscriptions;

-- Drop old FK constraints
ALTER TABLE IF EXISTS public.store_subscriptions
  DROP CONSTRAINT IF EXISTS store_subscriptions_account_id_fkey;

ALTER TABLE IF EXISTS public.subscription_transactions
  DROP CONSTRAINT IF EXISTS subscription_transactions_account_id_fkey;

-- Make sure account_id is NOT NULL
ALTER TABLE public.store_subscriptions
  ALTER COLUMN account_id SET NOT NULL;

ALTER TABLE public.subscription_transactions
  ALTER COLUMN account_id SET NOT NULL;

-- Recreate FK constraints to stores(id)
ALTER TABLE public.store_subscriptions
  ADD CONSTRAINT store_subscriptions_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES public.stores(id)
    ON DELETE CASCADE;

ALTER TABLE public.subscription_transactions
  ADD CONSTRAINT subscription_transactions_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES public.stores(id)
    ON DELETE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_account_id
  ON public.store_subscriptions(account_id);

CREATE INDEX IF NOT EXISTS idx_subscription_transactions_account_id
  ON public.subscription_transactions(account_id);

COMMIT;