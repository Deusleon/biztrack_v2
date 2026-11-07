-- =====================================================
-- Migration 004: Stores
-- =====================================================

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    owner_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    store_code VARCHAR(100) NOT NULL,
    CONSTRAINT stores_pkey PRIMARY KEY (id),
    CONSTRAINT stores_store_code_key UNIQUE (store_code),
    CONSTRAINT stores_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trigger_update_stores_updated_at ON public.stores;
CREATE TRIGGER trigger_update_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
