-- =====================================================
-- Migration 009: Price Categories & Selling Prices
-- =====================================================

-- Price Categories
CREATE TABLE IF NOT EXISTS public.price_categories (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT price_categories_pkey PRIMARY KEY (id),
    CONSTRAINT price_categories_store_id_name_key UNIQUE (store_id, name),
    CONSTRAINT price_categories_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

-- Price Changes log
CREATE TABLE IF NOT EXISTS public.price_changes (
    id UUID NOT NULL,
    product_id UUID,
    old_price NUMERIC(12,2),
    new_price NUMERIC(12,2),
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT price_changes_pkey PRIMARY KEY (id),
    CONSTRAINT price_changes_changed_by_fkey
        FOREIGN KEY (changed_by) REFERENCES public.users(id),
    CONSTRAINT price_changes_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id)
);

DROP TRIGGER IF EXISTS trigger_update_price_changes_updated_at ON public.price_changes;
CREATE TRIGGER trigger_update_price_changes_updated_at
    BEFORE UPDATE ON public.price_changes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
