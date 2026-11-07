-- =====================================================
-- Migration 019: Supplier Returns & Credit Notes
-- =====================================================

-- Supplier Returns
CREATE TABLE IF NOT EXISTS public.supplier_returns (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    grn_id UUID,
    return_number VARCHAR(50) NOT NULL,
    return_date TIMESTAMP DEFAULT now() NOT NULL,
    return_reason VARCHAR(50) NOT NULL,
    reason_details TEXT,
    total_items INTEGER DEFAULT 0,
    total_quantity NUMERIC(15,3) DEFAULT 0,
    total_value NUMERIC(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'draft',
    supplier_acknowledgement BOOLEAN DEFAULT false,
    credit_note_number VARCHAR(100),
    credit_amount NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_returns_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_returns_store_id_return_number_key UNIQUE (store_id, return_number),
    CONSTRAINT supplier_returns_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES public.users(id),
    CONSTRAINT supplier_returns_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT supplier_returns_grn_id_fkey
        FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL,
    CONSTRAINT supplier_returns_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT supplier_returns_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT supplier_returns_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
COMMENT ON TABLE public.supplier_returns IS 'Goods returned to suppliers';

CREATE INDEX IF NOT EXISTS idx_supplier_returns_status ON public.supplier_returns USING btree (status);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_store ON public.supplier_returns USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON public.supplier_returns USING btree (supplier_id);

-- Supplier Return Items
CREATE TABLE IF NOT EXISTS public.supplier_return_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    supplier_return_id UUID NOT NULL,
    product_id UUID NOT NULL,
    batch_id UUID,
    grn_item_id UUID,
    quantity NUMERIC(10,3) NOT NULL,
    unit_cost NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,
    reason VARCHAR(50),
    notes TEXT,
    condition VARCHAR(30) DEFAULT 'damaged',
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_return_items_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_return_items_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT supplier_return_items_grn_item_id_fkey
        FOREIGN KEY (grn_item_id) REFERENCES public.grn_items(id) ON DELETE SET NULL,
    CONSTRAINT supplier_return_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    CONSTRAINT supplier_return_items_supplier_return_id_fkey
        FOREIGN KEY (supplier_return_id) REFERENCES public.supplier_returns(id) ON DELETE CASCADE
);

-- Supplier Credit Notes
CREATE TABLE IF NOT EXISTS public.supplier_credit_notes (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    supplier_return_id UUID,
    supplier_invoice_id UUID,
    credit_note_number VARCHAR(50) NOT NULL,
    supplier_credit_note_number VARCHAR(100),
    credit_date DATE NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    amount_used NUMERIC(15,2) DEFAULT 0,
    balance NUMERIC(15,2) GENERATED ALWAYS AS (amount - amount_used) STORED,
    reason VARCHAR(50) NOT NULL,
    reason_details TEXT,
    status VARCHAR(30) DEFAULT 'active',
    expiry_date DATE,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_credit_notes_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_credit_notes_store_id_credit_note_number_key UNIQUE (store_id, credit_note_number),
    CONSTRAINT supplier_credit_notes_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT supplier_credit_notes_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT supplier_credit_notes_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT supplier_credit_notes_supplier_invoice_id_fkey
        FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
    CONSTRAINT supplier_credit_notes_supplier_return_id_fkey
        FOREIGN KEY (supplier_return_id) REFERENCES public.supplier_returns(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.supplier_credit_notes IS 'Credit notes received from suppliers';

CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_status ON public.supplier_credit_notes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_store ON public.supplier_credit_notes USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_supplier ON public.supplier_credit_notes USING btree (supplier_id);
