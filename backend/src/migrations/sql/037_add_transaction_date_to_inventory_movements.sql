-- =====================================================
-- Migration 037: Add transaction_date to inventory_movements
-- =====================================================
-- This migration adds a transaction_date column and populates it
-- with existing created_at values for all records.

BEGIN;

-- Add transaction_date column to inventory_movements table
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMPTZ;

-- Add comment to explain the column
COMMENT ON COLUMN public.inventory_movements.transaction_date IS 
  'The actual date/time when the inventory transaction occurred';

-- Populate transaction_date with existing created_at values (one-time migration)
UPDATE public.inventory_movements
SET transaction_date = created_at
WHERE transaction_date IS NULL;

-- Create index on transaction_date for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_movements_transaction_date
  ON public.inventory_movements USING btree (transaction_date);

-- Create composite index for common queries (store + transaction_date)
CREATE INDEX IF NOT EXISTS idx_inventory_movements_store_transaction_date
  ON public.inventory_movements USING btree (store_id, transaction_date);

COMMIT;
