-- Sequential stock-transfer numbers (TR-00001, TR-00002 ...) per source store.
ALTER TABLE public.store_invoice_counters
  ADD COLUMN IF NOT EXISTS last_transfer_number INTEGER NOT NULL DEFAULT 0;
