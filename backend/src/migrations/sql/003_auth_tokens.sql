-- =====================================================
-- Migration 003: Auth tokens (email verification & password reset)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMP,
    CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id)
);

DROP TRIGGER IF EXISTS trigger_update_email_verification_tokens_updated_at ON public.email_verification_tokens;
CREATE TRIGGER trigger_update_email_verification_tokens_updated_at
    BEFORE UPDATE ON public.email_verification_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    user_id UUID,
    updated_at TIMESTAMPTZ,
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT password_reset_tokens_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trigger_update_password_reset_tokens_updated_at ON public.password_reset_tokens;
CREATE TRIGGER trigger_update_password_reset_tokens_updated_at
    BEFORE UPDATE ON public.password_reset_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
