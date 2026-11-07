-- =====================================================
-- Migration 020: Stock Management
-- =====================================================

-- Stock Adjustments
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    adjustment_type VARCHAR(50) NOT NULL,
    quantity NUMERIC NOT NULL,
    reason VARCHAR NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    batch_id UUID,
    CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id),
    CONSTRAINT stock_adjustments_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT stock_adjustments_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    CONSTRAINT stock_adjustments_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT stock_adjustments_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_adj_store ON public.stock_adjustments USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_product ON public.stock_adjustments USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_date ON public.stock_adjustments USING btree (created_at);

-- Stock Counts
CREATE TABLE IF NOT EXISTS public.stock_counts (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    reference_number TEXT NOT NULL,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_counts_pkey PRIMARY KEY (id),
    CONSTRAINT stock_counts_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT stock_counts_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Stock Count Items
CREATE TABLE IF NOT EXISTS public.stock_count_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    stock_count_id UUID NOT NULL,
    product_id UUID NOT NULL,
    system_qty NUMERIC DEFAULT 0 NOT NULL,
    counted_qty NUMERIC DEFAULT 0 NOT NULL,
    difference NUMERIC DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_count_items_pkey PRIMARY KEY (id),
    CONSTRAINT stock_count_items_stock_count_id_fkey
        FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id) ON DELETE CASCADE,
    CONSTRAINT stock_count_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id)
);

-- Stock Transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    reference_number TEXT NOT NULL,
    source_store_id UUID NOT NULL,
    destination_store_id UUID NOT NULL,
    status VARCHAR DEFAULT 'pending' NOT NULL,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMPTZ,
    received_by UUID,
    CONSTRAINT stock_transfers_pkey PRIMARY KEY (id),
    CONSTRAINT stock_transfers_source_store_id_fkey
        FOREIGN KEY (source_store_id) REFERENCES public.stores(id),
    CONSTRAINT stock_transfers_destination_store_id_fkey
        FOREIGN KEY (destination_store_id) REFERENCES public.stores(id),
    CONSTRAINT stock_transfers_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT stock_transfers_received_by_fkey
        FOREIGN KEY (received_by) REFERENCES public.users(id)
);

-- Stock Transfer Items
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    transfer_id UUID NOT NULL,
    product_id UUID NOT NULL,
    source_batch_id UUID,
    destination_batch_id UUID,
    destination_product_id UUID,
    quantity NUMERIC NOT NULL,
    batch_number TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_transfer_items_pkey PRIMARY KEY (id),
    CONSTRAINT stock_transfer_items_transfer_id_fkey
        FOREIGN KEY (transfer_id) REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    CONSTRAINT stock_transfer_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id),
    CONSTRAINT stock_transfer_items_source_batch_id_fkey
        FOREIGN KEY (source_batch_id) REFERENCES public.inventory_batches(id),
    CONSTRAINT stock_transfer_items_destination_batch_id_fkey
        FOREIGN KEY (destination_batch_id) REFERENCES public.inventory_batches(id),
    CONSTRAINT stock_transfer_items_destination_product_id_fkey
        FOREIGN KEY (destination_product_id) REFERENCES public.products(id)
);

-- Stock Value History
CREATE TABLE IF NOT EXISTS public.stock_value_history (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    price_category_id UUID NOT NULL,
    snapshot_date TIMESTAMP DEFAULT now(),
    total_stock_worth NUMERIC DEFAULT 0,
    total_potential_revenue NUMERIC DEFAULT 0,
    total_potential_profit NUMERIC DEFAULT 0,
    profit_margin NUMERIC DEFAULT 0,
    total_products INTEGER DEFAULT 0,
    total_quantity NUMERIC DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP DEFAULT now(),
    notes TEXT,
    CONSTRAINT stock_value_history_pkey PRIMARY KEY (id),
    CONSTRAINT stock_value_history_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT stock_value_history_price_category_id_fkey
        FOREIGN KEY (price_category_id) REFERENCES public.price_categories(id),
    CONSTRAINT stock_value_history_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_value_history_store ON public.stock_value_history USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_value_history_date ON public.stock_value_history USING btree (snapshot_date);

-- Stock Value History Items
CREATE TABLE IF NOT EXISTS public.stock_value_history_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    history_id UUID NOT NULL,
    product_id UUID NOT NULL,
    product_name VARCHAR NOT NULL,
    category_name VARCHAR,
    unit VARCHAR,
    current_stock NUMERIC NOT NULL,
    cost_price NUMERIC NOT NULL,
    selling_price NUMERIC NOT NULL,
    stock_worth NUMERIC NOT NULL,
    potential_revenue NUMERIC NOT NULL,
    potential_profit NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT stock_value_history_items_pkey PRIMARY KEY (id),
    CONSTRAINT stock_value_history_items_history_id_fkey
        FOREIGN KEY (history_id) REFERENCES public.stock_value_history(id) ON DELETE CASCADE,
    CONSTRAINT stock_value_history_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_stock_value_items_history ON public.stock_value_history_items USING btree (history_id);
CREATE INDEX IF NOT EXISTS idx_stock_value_items_product ON public.stock_value_history_items USING btree (product_id);
