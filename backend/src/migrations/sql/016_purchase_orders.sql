-- =====================================================
-- Migration 016: Purchase Orders
-- =====================================================

-- Purchase Orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    po_number VARCHAR(50) NOT NULL,
    order_date TIMESTAMPTZ DEFAULT now() NOT NULL,
    expected_delivery_date DATE,
    delivery_address TEXT,
    subtotal NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    shipping_cost NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'TZS',
    status VARCHAR(30) DEFAULT 'pending_approval',
    status_by UUID,
    status_at TIMESTAMPTZ,
    payment_terms VARCHAR(100),
    notes TEXT,
    internal_notes TEXT,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_orders_store_id_po_number_key UNIQUE (store_id, po_number),
    CONSTRAINT purchase_orders_status_by_fkey
        FOREIGN KEY (status_by) REFERENCES public.users(id),
    CONSTRAINT purchase_orders_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT purchase_orders_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT purchase_orders_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT purchase_orders_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
COMMENT ON TABLE public.purchase_orders IS 'Purchase orders sent to suppliers';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON public.purchase_orders USING btree (order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders USING btree (po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON public.purchase_orders USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders USING btree (supplier_id);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    received_quantity NUMERIC(10,2) DEFAULT 0,
    pending_quantity NUMERIC(10,2) GENERATED ALWAYS AS (quantity - received_quantity) STORED,
    unit_price NUMERIC(15,2) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    line_total NUMERIC(15,2) NOT NULL,
    specifications TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_order_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    CONSTRAINT purchase_order_items_purchase_order_id_fkey
        FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
    ON public.purchase_order_items USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product
    ON public.purchase_order_items USING btree (product_id);

-- Purchase Approvals
CREATE TABLE IF NOT EXISTS public.purchase_approvals (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID NOT NULL,
    approval_level INTEGER DEFAULT 1,
    required_role VARCHAR(50),
    min_approvers INTEGER DEFAULT 1,
    status VARCHAR(30) DEFAULT 'pending',
    status_by UUID,
    status_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT purchase_approvals_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_approvals_status_by_fkey
        FOREIGN KEY (status_by) REFERENCES public.users(id),
    CONSTRAINT purchase_approvals_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
