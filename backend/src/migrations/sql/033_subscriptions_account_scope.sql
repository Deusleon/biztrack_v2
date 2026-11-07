-- =====================================================
-- Migration 033: Move subscriptions to account scope
-- =====================================================

ALTER TABLE IF EXISTS public.store_subscriptions
  ADD COLUMN IF NOT EXISTS account_id UUID;

ALTER TABLE IF EXISTS public.subscription_transactions
  ADD COLUMN IF NOT EXISTS account_id UUID;

DO $$
BEGIN
  -- Backfill store_subscriptions.account_id from stores.owner_id only if legacy store_id exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_subscriptions'
      AND column_name = 'store_id'
  ) THEN
    UPDATE public.store_subscriptions ss
    SET account_id = s.owner_id
    FROM public.stores s
    WHERE ss.account_id IS NULL
      AND ss.store_id = s.id
      AND s.owner_id IS NOT NULL;
  END IF;

  -- Fallback to creator when owner is missing.
  UPDATE public.store_subscriptions
  SET account_id = created_by
  WHERE account_id IS NULL
    AND created_by IS NOT NULL;

  -- Backfill subscription_transactions.account_id from stores.owner_id when store_id exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_transactions'
      AND column_name = 'store_id'
  ) THEN
    UPDATE public.subscription_transactions st
    SET account_id = s.owner_id
    FROM public.stores s
    WHERE st.account_id IS NULL
      AND st.store_id = s.id
      AND s.owner_id IS NOT NULL;

    -- Store context becomes optional after account-level refactor.
    ALTER TABLE public.subscription_transactions
      ALTER COLUMN store_id DROP NOT NULL;
  END IF;

  -- Fallback to creator when owner is missing.
  UPDATE public.subscription_transactions
  SET account_id = created_by
  WHERE account_id IS NULL
    AND created_by IS NOT NULL;
END $$;

-- Add account foreign keys if not present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_subscriptions_account_id_fkey'
  ) THEN
    ALTER TABLE public.store_subscriptions
      ADD CONSTRAINT store_subscriptions_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_transactions_account_id_fkey'
  ) THEN
    ALTER TABLE public.subscription_transactions
      ADD CONSTRAINT subscription_transactions_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_subscriptions_account_id
  ON public.store_subscriptions(account_id);

CREATE INDEX IF NOT EXISTS idx_store_subscriptions_account_status
  ON public.store_subscriptions(account_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_transactions_account_created
  ON public.subscription_transactions(account_id, created_at DESC);
