-- =====================================================
-- Migration 010: Inventory (Batches, Movements, Selling Prices)
-- =====================================================

-- Inventory Batches
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    batch_number TEXT NOT NULL,
    cost_price NUMERIC(12,2),
    manufacturing_date DATE,
    expiry_date DATE,
    status TEXT DEFAULT 'active',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    selling_price NUMERIC(12,2),
    activated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT inventory_batches_pkey PRIMARY KEY (id),
    CONSTRAINT unique_batch_per_product_per_store UNIQUE (store_id, product_id, batch_number),
    CONSTRAINT inventory_batches_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT inventory_batches_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    CONSTRAINT inventory_batches_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry
    ON public.inventory_batches USING btree (COALESCE(expiry_date, 'infinity'::date));
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_status
    ON public.inventory_batches USING btree (product_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_store
    ON public.inventory_batches USING btree (product_id, store_id);

DROP TRIGGER IF EXISTS trigger_update_inventory_batches_updated_at ON public.inventory_batches;
CREATE TRIGGER trigger_update_inventory_batches_updated_at
    BEFORE UPDATE ON public.inventory_batches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inventory Movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    batch_id UUID,
    product_id UUID NOT NULL,
    store_id UUID NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
    CONSTRAINT inventory_movements_type_check
        CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
    CONSTRAINT inventory_movements_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT inventory_movements_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT inventory_movements_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    CONSTRAINT inventory_movements_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_store
    ON public.inventory_movements USING btree (product_id, store_id);

DROP TRIGGER IF EXISTS trigger_update_inventory_movements_updated_at ON public.inventory_movements;
CREATE TRIGGER trigger_update_inventory_movements_updated_at
    BEFORE UPDATE ON public.inventory_movements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Selling Prices (batch × price-category)
CREATE TABLE IF NOT EXISTS public.selling_prices (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    batch_id UUID NOT NULL,
    price_category_id UUID NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT selling_prices_pkey PRIMARY KEY (id),
    CONSTRAINT fk_selling_prices_batch
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_selling_prices_price_category
        FOREIGN KEY (price_category_id) REFERENCES public.price_categories(id) ON DELETE CASCADE
);
