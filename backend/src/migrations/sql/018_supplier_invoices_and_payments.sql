-- =====================================================
-- Migration 018: Supplier Invoices & Payments
-- =====================================================

-- Supplier Invoices (Bills)
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    purchase_order_id UUID,
    grn_id UUID,
    bill_number VARCHAR(50) NOT NULL,
    supplier_invoice_number VARCHAR(100),
    invoice_date DATE NOT NULL,
    due_date DATE,
    subtotal NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    shipping_cost NUMERIC(15,2) DEFAULT 0,
    other_charges NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL,
    amount_paid NUMERIC(15,2) DEFAULT 0,
    balance_due NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    currency VARCHAR(3) DEFAULT 'TZS',
    status VARCHAR(30) DEFAULT 'draft',
    payment_status VARCHAR(30) DEFAULT 'unpaid',
    approved_by UUID,
    approved_at TIMESTAMP,
    notes TEXT,
    attachment_url TEXT,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_invoices_store_id_bill_number_key UNIQUE (store_id, bill_number),
    CONSTRAINT supplier_invoices_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES public.users(id),
    CONSTRAINT supplier_invoices_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT supplier_invoices_grn_id_fkey
        FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL,
    CONSTRAINT supplier_invoices_purchase_order_id_fkey
        FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    CONSTRAINT supplier_invoices_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT supplier_invoices_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT supplier_invoices_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
COMMENT ON TABLE public.supplier_invoices IS 'Bills/invoices received from suppliers';

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date ON public.supplier_invoices USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_payment_status ON public.supplier_invoices USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON public.supplier_invoices USING btree (status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store ON public.supplier_invoices USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON public.supplier_invoices USING btree (supplier_id);

-- Supplier Invoice Items
CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    supplier_invoice_id UUID NOT NULL,
    product_id UUID,
    grn_item_id UUID,
    description TEXT NOT NULL,
    quantity NUMERIC(10,3) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    line_total NUMERIC(15,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_invoice_items_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_invoice_items_grn_item_id_fkey
        FOREIGN KEY (grn_item_id) REFERENCES public.grn_items(id) ON DELETE SET NULL,
    CONSTRAINT supplier_invoice_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL,
    CONSTRAINT supplier_invoice_items_supplier_invoice_id_fkey
        FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE CASCADE
);

-- Supplier Payments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    supplier_invoice_id UUID,
    payment_number VARCHAR(50) NOT NULL,
    payment_date TIMESTAMP DEFAULT now() NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    status VARCHAR(30) DEFAULT 'completed',
    notes TEXT,
    attachment_url TEXT,
    created_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT supplier_payments_pkey PRIMARY KEY (id),
    CONSTRAINT supplier_payments_store_id_payment_number_key UNIQUE (store_id, payment_number),
    CONSTRAINT supplier_payments_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES public.users(id),
    CONSTRAINT supplier_payments_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT supplier_payments_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT supplier_payments_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT supplier_payments_supplier_invoice_id_fkey
        FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.supplier_payments IS 'Payments made to suppliers';

CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON public.supplier_payments USING btree (payment_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice ON public.supplier_payments USING btree (supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_store ON public.supplier_payments USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments USING btree (supplier_id);
