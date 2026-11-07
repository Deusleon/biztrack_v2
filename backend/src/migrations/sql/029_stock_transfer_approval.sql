-- Migration 029: Stock Transfer Approval Flow
-- Adds approval step before transfer is sent to destination store
-- Also adds received_quantity and condition per item when receiving

-- 1. Add approval columns to stock_transfers
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Update the status CHECK constraint to include 'pending_approval'
ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;
ALTER TABLE stock_transfers
  ADD CONSTRAINT stock_transfers_status_check
  CHECK (status IN ('pending_approval', 'pending', 'completed', 'cancelled'));

-- 3. Add received_quantity and condition to stock_transfer_items
ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS condition VARCHAR(50) DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS condition_notes TEXT;
