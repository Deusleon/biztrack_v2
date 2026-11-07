-- =====================================================
-- Migration 014: Sales Returns
-- =====================================================

-- Sales Returns (header)
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    return_number VARCHAR(50) NOT NULL,
    original_invoice_number VARCHAR(50) NOT NULL,
    original_cart_code VARCHAR(100) NOT NULL,
    store_id UUID NOT NULL,
    customer_id UUID,
    user_id UUID NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    refund_method VARCHAR(50) DEFAULT 'cash',
    status VARCHAR(20) DEFAULT 'pending',
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT sales_returns_pkey PRIMARY KEY (id),
    CONSTRAINT sales_returns_status_check
        CHECK (status IN ('pending', 'approved', 'completed', 'rejected')),
    CONSTRAINT sales_returns_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    CONSTRAINT sales_returns_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id),
    CONSTRAINT sales_returns_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id)
);
COMMENT ON TABLE public.sales_returns IS 'Stores sales return headers';

CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice
    ON public.sales_returns USING btree (original_invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_returns_store
    ON public.sales_returns USING btree (store_id);

DROP TRIGGER IF EXISTS update_sales_returns_updated_at ON public.sales_returns;
CREATE TRIGGER update_sales_returns_updated_at
    BEFORE UPDATE ON public.sales_returns
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sales Return Items
CREATE TABLE IF NOT EXISTS public.sales_return_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    sales_return_id UUID NOT NULL,
    product_id UUID NOT NULL,
    batch_id UUID,
    quantity NUMERIC(10,2) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    return_reason VARCHAR(100),
    condition VARCHAR(50) DEFAULT 'good',
    restock BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sales_return_items_pkey PRIMARY KEY (id),
    CONSTRAINT sales_return_items_condition_check
        CHECK (condition IN ('good', 'damaged', 'expired', 'other')),
    CONSTRAINT sales_return_items_sales_return_id_fkey
        FOREIGN KEY (sales_return_id) REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    CONSTRAINT sales_return_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id),
    CONSTRAINT sales_return_items_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id)
);
COMMENT ON TABLE public.sales_return_items IS 'Stores individual items in a sales return';

CREATE INDEX IF NOT EXISTS idx_sales_return_items_return
    ON public.sales_return_items USING btree (sales_return_id);
