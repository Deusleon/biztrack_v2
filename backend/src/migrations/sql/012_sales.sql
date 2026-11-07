-- =====================================================
-- Migration 012: Sales (Payments, Sales Record, Pending Orders)
-- =====================================================

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    invoice_number VARCHAR(50),
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    cart_code VARCHAR NOT NULL,
    sale_type VARCHAR(20) DEFAULT 'cash',
    subtotal NUMERIC(12,2),
    total_discount NUMERIC(12,2),
    total_vat NUMERIC(12,2),
    total_amount NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    amount_change NUMERIC(12,2) DEFAULT 0,
    amount_due NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sales_date TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT payments_new_pkey1 PRIMARY KEY (id)
);

-- Sales Record (profit/loss tracking)
CREATE TABLE IF NOT EXISTS public.salesrecord (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    invoice_number VARCHAR(50),
    profit NUMERIC(12,2) NOT NULL,
    loss NUMERIC(12,2) DEFAULT 0,
    user_id UUID NOT NULL,
    store_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT salesrecord_pkey PRIMARY KEY (id),
    CONSTRAINT salesrecord_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Pending Orders
CREATE TABLE IF NOT EXISTS public.pending_orders (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    cart_code VARCHAR(100) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    total_discount NUMERIC(12,2),
    total_vat NUMERIC(12,2),
    subtotal NUMERIC(12,2),
    CONSTRAINT sales_orders_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE public.pending_orders IS 'Stores sales orders and proforma invoices';

DROP TRIGGER IF EXISTS update_sales_orders_updated_at ON public.pending_orders;
CREATE TRIGGER update_sales_orders_updated_at
    BEFORE UPDATE ON public.pending_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pending Orders Payments
CREATE TABLE IF NOT EXISTS public.pending_orders_payments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    cart_code VARCHAR NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    amount_change NUMERIC(12,2) DEFAULT 0,
    amount_due NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT pending_orders_payments_pkey PRIMARY KEY (id)
);
