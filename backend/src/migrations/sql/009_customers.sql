-- =====================================================
-- Migration 007: Customers
-- =====================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    customer_type UUID NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    store_id UUID NOT NULL,
    credit_limit NUMERIC(12,2) DEFAULT 0,
    current_balance NUMERIC(12,2) DEFAULT 0,
    credit_due_days INTEGER DEFAULT 0,
    CONSTRAINT customers_pkey PRIMARY KEY (id),
    CONSTRAINT customers_email_key UNIQUE (email),
    CONSTRAINT customers_phone_key UNIQUE (phone),
    CONSTRAINT customers_customer_type_fkey
        FOREIGN KEY (customer_type) REFERENCES public.price_categories(id) ON DELETE SET NULL,
    CONSTRAINT customers_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT customers_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers USING btree (email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);

DROP TRIGGER IF EXISTS trigger_update_customers_updated_at ON public.customers;
CREATE TRIGGER trigger_update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
