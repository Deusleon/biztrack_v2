-- =====================================================
-- Migration 017: GRN (Goods Received Notes)
-- =====================================================

-- Goods Received Notes
CREATE TABLE IF NOT EXISTS public.goods_received_notes (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    purchase_order_id UUID,
    supplier_id UUID NOT NULL,
    grn_number VARCHAR(50) NOT NULL,
    received_date TIMESTAMP DEFAULT now() NOT NULL,
    supplier_delivery_note VARCHAR(100),
    supplier_invoice_number VARCHAR(100),
    status VARCHAR(30) DEFAULT 'draft',
    inspection_status VARCHAR(30) DEFAULT 'pending',
    inspected_by UUID,
    inspected_at TIMESTAMP,
    inspection_notes TEXT,
    total_items INTEGER DEFAULT 0,
    total_quantity NUMERIC(15,3) DEFAULT 0,
    total_value NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    received_by UUID NOT NULL,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT goods_received_notes_pkey PRIMARY KEY (id),
    CONSTRAINT goods_received_notes_store_id_grn_number_key UNIQUE (store_id, grn_number),
    CONSTRAINT goods_received_notes_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT goods_received_notes_inspected_by_fkey
        FOREIGN KEY (inspected_by) REFERENCES public.users(id),
    CONSTRAINT goods_received_notes_purchase_order_id_fkey
        FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    CONSTRAINT goods_received_notes_received_by_fkey
        FOREIGN KEY (received_by) REFERENCES public.users(id),
    CONSTRAINT goods_received_notes_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT goods_received_notes_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT goods_received_notes_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
COMMENT ON TABLE public.goods_received_notes IS 'Records of goods received from suppliers';

CREATE INDEX IF NOT EXISTS idx_grn_date ON public.goods_received_notes USING btree (received_date);
CREATE INDEX IF NOT EXISTS idx_grn_po ON public.goods_received_notes USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grn_status ON public.goods_received_notes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_grn_store ON public.goods_received_notes USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier ON public.goods_received_notes USING btree (supplier_id);

-- GRN Items
CREATE TABLE IF NOT EXISTS public.grn_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    grn_id UUID NOT NULL,
    purchase_order_item_id UUID,
    product_id UUID NOT NULL,
    batch_id UUID,
    expected_quantity NUMERIC(10,3) DEFAULT 0,
    received_quantity NUMERIC(10,3) NOT NULL,
    accepted_quantity NUMERIC(10,3) DEFAULT 0,
    rejected_quantity NUMERIC(10,3) DEFAULT 0,
    unit_cost NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,
    batch_number VARCHAR(100),
    manufacturing_date DATE,
    expiry_date DATE,
    inspection_status VARCHAR(30) DEFAULT 'pending',
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT grn_items_pkey PRIMARY KEY (id),
    CONSTRAINT grn_items_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT grn_items_grn_id_fkey
        FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
    CONSTRAINT grn_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    CONSTRAINT grn_items_purchase_order_item_id_fkey
        FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_grn_items_batch ON public.grn_items USING btree (batch_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON public.grn_items USING btree (grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product ON public.grn_items USING btree (product_id);
