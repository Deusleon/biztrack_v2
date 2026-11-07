-- =====================================================
-- Migration 024: Supplier Return Refund Fields
-- =====================================================

ALTER TABLE public.supplier_returns
    ADD COLUMN IF NOT EXISTS supplier_invoice_id UUID,
    ADD COLUMN IF NOT EXISTS refund_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'supplier_returns'
          AND constraint_name = 'supplier_returns_supplier_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.supplier_returns
            ADD CONSTRAINT supplier_returns_supplier_invoice_id_fkey
            FOREIGN KEY (supplier_invoice_id)
            REFERENCES public.supplier_invoices(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_returns_invoice
    ON public.supplier_returns USING btree (supplier_invoice_id);
