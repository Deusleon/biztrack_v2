-- =====================================================
-- Migration 045: v_cart_line_profit -- single source of truth
-- for per-cart-line revenue/cost/profit
-- =====================================================
-- This view replaces the copy-pasted "invoiceProfitQuery" pattern that
-- previously existed 3+ times across report.controller.js. All profit
-- reports (detailed, by product, by category, by customer, by cashier,
-- trends, and the top-level summary) should read from this view and
-- just add their own JOIN/GROUP BY on top.
--
-- Two things make this correct where the old pattern wasn't:
--   1. cost_agg is joined on inventory_movements.cart_id = cart.id
--      (exact line match -- see migration 044) instead of
--      product_id + store_id + transaction_date (which fanned out
--      across every invoice selling the same product on the same day).
--   2. line_cost is the weighted-average unit cost of the batches
--      ORIGINALLY consumed by this line, multiplied by the cart's
--      CURRENT quantity (c.quantity). Because sales returns reduce
--      cart.quantity in place (see approveReturn in
--      sales.controller.js), this automatically nets out cost for
--      returned units -- full return -> quantity 0 -> cost 0 -> no
--      more phantom losses. Partial returns are pro-rated correctly
--      too, with no need to separately track "original vs returned"
--      quantity.

BEGIN;

CREATE OR REPLACE VIEW public.v_cart_line_profit AS
SELECT
  c.id                      AS cart_id,
  c.store_id,
  c.product_id,
  c.customer_id,
  pr.category_id,
  p.invoice_number,
  p.sales_date,
  p.user_id                 AS cashier_id,
  c.quantity,
  c.discount_mode,
  c.price                   AS original_selling_price,

  pricing.discount_amount,
  pricing.final_selling_price,

  (pricing.discount_amount * c.quantity)       AS line_discount,
  (pricing.final_selling_price * c.quantity)   AS line_revenue,

  CASE
    WHEN COALESCE(cost_agg.total_batch_qty, 0) > 0
      THEN (cost_agg.total_batch_cost / cost_agg.total_batch_qty) * c.quantity
    ELSE 0
  END                                            AS line_cost,

  CASE
    WHEN COALESCE(cost_agg.total_batch_qty, 0) > 0
      THEN cost_agg.total_batch_cost / cost_agg.total_batch_qty
    ELSE 0
  END                                            AS avg_unit_cost,

  (
    pricing.final_selling_price * c.quantity
    - CASE
        WHEN COALESCE(cost_agg.total_batch_qty, 0) > 0
          THEN (cost_agg.total_batch_cost / cost_agg.total_batch_qty) * c.quantity
        ELSE 0
      END
  )                                               AS line_profit,

  -- true when this line has no cart_id-linked OUT movements at all --
  -- i.e. it predates migration 044 and still needs the legacy
  -- product+store+date fallback if you choose to report on it.
  (cost_agg.total_batch_qty IS NULL)              AS is_unlinked_legacy_row

FROM cart c

JOIN payments p
  ON p.cart_code = c.cart_code

JOIN products pr
  ON pr.id = c.product_id

CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN c.discount_mode = 'percentage'
        THEN c.price * COALESCE(c.discount, 0) / 100.0
      WHEN c.discount_mode = 'amount'
        THEN COALESCE(c.discount, 0)
      ELSE 0
    END AS discount_amount,

    CASE
      WHEN c.discount_mode = 'percentage'
        THEN c.price - (c.price * COALESCE(c.discount, 0) / 100.0)
      WHEN c.discount_mode = 'amount'
        THEN c.price - COALESCE(c.discount, 0)
      ELSE c.price
    END AS final_selling_price
) pricing

LEFT JOIN LATERAL (
  SELECT
    SUM(im.quantity)                 AS total_batch_qty,
    SUM(im.quantity * ib.cost_price) AS total_batch_cost
  FROM inventory_movements im
  JOIN inventory_batches ib
    ON ib.id = im.batch_id
  WHERE im.cart_id = c.id
    AND im.type = 'OUT'
) cost_agg ON TRUE

WHERE c.status = 'Sold';

COMMENT ON VIEW public.v_cart_line_profit IS
  'Canonical per-cart-line revenue/cost/profit. Source of truth for all '
  'profit reports. Cost is exact-linked via inventory_movements.cart_id '
  '(migration 044) and automatically return-safe because cart.quantity '
  'is mutated in place by the return-approval flow.';

COMMIT;
