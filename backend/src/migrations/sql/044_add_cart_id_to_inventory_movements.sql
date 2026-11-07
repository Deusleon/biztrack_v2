-- =====================================================
-- Migration 044: Link inventory_movements to the exact cart line
-- =====================================================
-- WHY:
-- inventory_movements currently has no direct reference to the cart
-- line (sale line item) it belongs to. Cost reports match movements
-- to cart lines by (product_id + store_id + transaction_date), which:
--   1. Fans out across ALL invoices selling the same product on the
--      same day at the same store (double/triple counts cost).
--   2. Cannot reflect quantity reductions caused by sales returns,
--      since returns mutate cart.quantity in place but never touch
--      the original OUT movement rows.
-- Adding cart_id gives an exact 1-line -> N-batch-movement link, so
-- cost can be computed per cart line with no ambiguity.

BEGIN;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS cart_id UUID;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_cart_id_fkey
    FOREIGN KEY (cart_id) REFERENCES public.cart(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inventory_movements.cart_id IS
  'The exact cart line (sale line item) this OUT movement was consumed by. '
  'NULL for movements not tied to a sale line (purchases, adjustments, '
  'stock transfers, return restocks, and any row created before this '
  'migration).';

CREATE INDEX IF NOT EXISTS idx_inventory_movements_cart_id
  ON public.inventory_movements USING btree (cart_id)
  WHERE cart_id IS NOT NULL;

-- NOTE ON BACKFILL:
-- Existing OUT rows (created before this migration) cannot be backfilled
-- with 100% certainty using the exact same product+store+date heuristic
-- that caused the ambiguity in the first place -- if that heuristic were
-- reliable, we wouldn't need this migration. Historical reports for dates
-- before this migration ships will keep using the old (best-effort, known
-- imprecise) matching as a fallback; only movements created after this
-- migration get the precise cart_id link. This tradeoff should be
-- communicated to stakeholders reading historical profit reports.

COMMIT;
