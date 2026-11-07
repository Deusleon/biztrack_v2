-- Adds selling_price to grn_items so the price entered (or resolved) at the
-- time goods are received can still be applied later when a GRN that
-- required inspection is finally approved (see purchaseOrder.controller.js
-- exports.inspectGRN). Without this column the inspection-approval flow had
-- no way to know what selling price to give the resulting inventory batch,
-- which was one of the causes of selling prices being reset on receiving.

ALTER TABLE public.grn_items
    ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2);
