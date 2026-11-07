-- =====================================================
-- Migration 040: User security policy enforcement
-- =====================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Existing accounts should not be treated as immediately expired after rollout.
UPDATE public.users
SET password_changed_at = NOW()
WHERE password_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_account_locked_until
    ON public.users(account_locked_until)
    WHERE account_locked_until IS NOT NULL;
