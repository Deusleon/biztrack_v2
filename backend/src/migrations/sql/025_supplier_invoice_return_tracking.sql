-- =====================================================
-- Migration 025: Supplier Invoice Return Tracking
-- Adds columns to track original total and accumulated
-- return deductions on supplier invoices for auditing.
-- =====================================================

ALTER TABLE public.supplier_invoices
    ADD COLUMN IF NOT EXISTS original_total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS return_deduction NUMERIC(15,2) DEFAULT 0;
