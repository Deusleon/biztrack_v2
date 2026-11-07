-- =====================================================
-- Migration 011: Cart & Invoice Counters
-- =====================================================

-- Cart
CREATE TABLE IF NOT EXISTS public.cart (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    invoice_number VARCHAR(50),
    quantity NUMERIC(10,2) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    discount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'OnProcess',
    cart_code TEXT NOT NULL,
    customer_id UUID,
    sale_type VARCHAR(20) DEFAULT 'cash',
    discount_mode VARCHAR(20),
    note TEXT,
    CONSTRAINT cart_pkey PRIMARY KEY (id),
    CONSTRAINT unique_cart_item_per_group UNIQUE (store_id, cart_code, product_id, user_id),
    CONSTRAINT unique_cart_item_per_invoice UNIQUE (store_id, invoice_number, product_id),
    CONSTRAINT cart_discount_check CHECK (discount >= 0),
    CONSTRAINT cart_price_check CHECK (price >= 0),
    CONSTRAINT cart_quantity_check CHECK (quantity >= 0),
    CONSTRAINT cart_sale_type_check CHECK (sale_type IN ('cash', 'credit', 'order')),
    CONSTRAINT cart_status_check CHECK (status IN ('OnProcess', 'Pending', 'Saved', 'Sold', 'OrderEdit')),
    CONSTRAINT cart_discount_mode_check CHECK (discount_mode IN ('amount', 'percentage')),
    CONSTRAINT cart_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    CONSTRAINT cart_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT cart_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_customer
        FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cart_unique_item_per_group
    ON public.cart USING btree (store_id, user_id, product_id, status, cart_code);
CREATE INDEX IF NOT EXISTS idx_cart_sale_type
    ON public.cart USING btree (sale_type);

DROP TRIGGER IF EXISTS trigger_update_cart_updated_at ON public.cart;
CREATE TRIGGER trigger_update_cart_updated_at
    BEFORE UPDATE ON public.cart
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice Counters (consolidated: invoices, sales orders, sales returns, purchase orders, GRNs, bills, supplier payments, purchase returns)
CREATE TABLE IF NOT EXISTS public.store_invoice_counters (
    store_id UUID NOT NULL,
    last_invoice_number INTEGER DEFAULT 0 NOT NULL,
    last_sales_return_number INTEGER DEFAULT 0 NOT NULL,
    last_sales_order_number INTEGER DEFAULT 0 NOT NULL,
    last_purchase_order_number INTEGER DEFAULT 0 NOT NULL,
    last_grn_number INTEGER DEFAULT 0 NOT NULL,
    last_bill_number INTEGER DEFAULT 0 NOT NULL,
    last_supplier_payment_number INTEGER DEFAULT 0 NOT NULL,
    last_purchase_return_number INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT store_invoice_counters_pkey PRIMARY KEY (store_id),
    CONSTRAINT store_invoice_counters_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
