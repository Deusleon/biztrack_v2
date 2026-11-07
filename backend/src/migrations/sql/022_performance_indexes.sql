-- =====================================================
-- Migration 022: Performance Indexes
-- Adds indexes on the most frequently queried columns
-- across all major tables to dramatically speed up
-- list/search/filter queries.
-- =====================================================

-- ─── products ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_store_id
    ON public.products (store_id);

CREATE INDEX IF NOT EXISTS idx_products_store_created
    ON public.products (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_barcode
    ON public.products (barcode)
    WHERE barcode IS NOT NULL;

-- ─── inventory_batches ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_batches_product_store
    ON public.inventory_batches (product_id, store_id);

CREATE INDEX IF NOT EXISTS idx_inv_batches_product_store_status
    ON public.inventory_batches (product_id, store_id, status);

-- ─── inventory_movements ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_movements_batch_id
    ON public.inventory_movements (batch_id);

CREATE INDEX IF NOT EXISTS idx_inv_movements_product_store
    ON public.inventory_movements (product_id, store_id);

CREATE INDEX IF NOT EXISTS idx_inv_movements_store_type
    ON public.inventory_movements (store_id, type);

-- ─── selling_prices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_selling_prices_batch_category
    ON public.selling_prices (batch_id, price_category_id);

-- ─── payments ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_store_id
    ON public.payments (store_id);

CREATE INDEX IF NOT EXISTS idx_payments_store_date
    ON public.payments (store_id, sales_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_cart_code
    ON public.payments (cart_code);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_number
    ON public.payments (invoice_number);

-- ─── cart ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cart_store_status
    ON public.cart (store_id, status);

CREATE INDEX IF NOT EXISTS idx_cart_cart_code
    ON public.cart (cart_code);

CREATE INDEX IF NOT EXISTS idx_cart_customer_id
    ON public.cart (customer_id);

-- ─── customers ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_store_id
    ON public.customers (store_id);

-- ─── suppliers ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id
    ON public.suppliers (store_id);

-- ─── purchase_orders ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_created
    ON public.purchase_orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_status
    ON public.purchase_orders (store_id, status);

-- ─── purchase_order_items ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_po_items_order_id
    ON public.purchase_order_items (purchase_order_id);

-- ─── permissions & role_permissions ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_permissions_name
    ON public.permissions (name);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_store
    ON public.role_permissions (role_id, store_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_store_allowed
    ON public.role_permissions (role_id, store_id, is_allowed);

-- ─── store_users ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_store_users_user_store
    ON public.store_users (user_id, store_id);

CREATE INDEX IF NOT EXISTS idx_store_users_store_status
    ON public.store_users (store_id, status);

-- ─── stock_counts ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_counts_store_created
    ON public.stock_counts (store_id, created_at DESC);

-- ─── stock_transfers ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_transfers_source_store_created
    ON public.stock_transfers (source_store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest_store_created
    ON public.stock_transfers (destination_store_id, created_at DESC);

-- ─── supplier_invoices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store_created
    ON public.supplier_invoices (store_id, created_at DESC);

-- ─── credit_sales (debit ledger) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_credit_sales_store_customer
    ON public.credit_sales (store_id, customer_id);
