-- =====================================================
-- Migration 023: Purchase Active Cart
-- Durable in-progress purchase carts per store/user.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.purchase_carts (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    cart_code VARCHAR(50) NOT NULL,
    supplier_id UUID,
    expected_delivery_date DATE,
    delivery_address TEXT,
    payment_terms VARCHAR(100),
    notes TEXT,
    internal_notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT purchase_carts_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_carts_store_user_key UNIQUE (store_id, user_id),
    CONSTRAINT purchase_carts_cart_code_key UNIQUE (cart_code),
    CONSTRAINT purchase_carts_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT purchase_carts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT purchase_carts_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_carts_store_user
    ON public.purchase_carts (store_id, user_id);

CREATE TABLE IF NOT EXISTS public.purchase_cart_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    purchase_cart_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT purchase_cart_items_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_cart_items_purchase_cart_id_fkey
        FOREIGN KEY (purchase_cart_id) REFERENCES public.purchase_carts(id) ON DELETE CASCADE,
    CONSTRAINT purchase_cart_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_purchase_cart_items_cart_id
    ON public.purchase_cart_items (purchase_cart_id);

CREATE INDEX IF NOT EXISTS idx_purchase_cart_items_product_id
    ON public.purchase_cart_items (product_id);