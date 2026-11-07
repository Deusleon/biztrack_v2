-- =====================================================
-- Migration 013: Credit Sales & Payments
-- =====================================================

-- Credit Sales
CREATE TABLE IF NOT EXISTS public.credit_sales (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    cart_code VARCHAR(100) NOT NULL,
    invoice_number VARCHAR(50),
    store_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    user_id UUID NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    amount_due NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'not_paid',
    due_date TIMESTAMPTZ,
    notes TEXT,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ,
    CONSTRAINT credit_sales_pkey PRIMARY KEY (id),
    CONSTRAINT credit_sales_status_check
        CHECK (status IN ('not_paid', 'partial_paid', 'paid', 'overdue', 'cancelled')),
    CONSTRAINT credit_sales_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    CONSTRAINT credit_sales_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id),
    CONSTRAINT credit_sales_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id)
);
COMMENT ON TABLE public.credit_sales IS 'Stores credit sale transactions with payment tracking';

CREATE INDEX IF NOT EXISTS idx_credit_sales_status
    ON public.credit_sales USING btree (status);
CREATE INDEX IF NOT EXISTS idx_credit_sales_store_customer
    ON public.credit_sales USING btree (store_id, customer_id);

DROP TRIGGER IF EXISTS update_credit_sales_updated_at ON public.credit_sales;
CREATE TRIGGER update_credit_sales_updated_at
    BEFORE UPDATE ON public.credit_sales
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Credit Payments
CREATE TABLE IF NOT EXISTS public.credit_payments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    credit_sale_id UUID NOT NULL,
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT credit_payments_pkey PRIMARY KEY (id),
    CONSTRAINT credit_payments_credit_sale_id_fkey
        FOREIGN KEY (credit_sale_id) REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    CONSTRAINT credit_payments_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id),
    CONSTRAINT credit_payments_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id)
);
COMMENT ON TABLE public.credit_payments IS 'Stores individual payments against credit sales';

CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_sale
    ON public.credit_payments USING btree (credit_sale_id);
