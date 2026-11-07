-- =====================================================
-- Migration 015: Suppliers
-- =====================================================

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    tin_number VARCHAR(100),
    vat_number VARCHAR(100),
    payment_terms VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT suppliers_pkey PRIMARY KEY (id),
    CONSTRAINT unique_supplier_email_per_store UNIQUE (store_id, email),
    CONSTRAINT unique_supplier_name_per_store UNIQUE (store_id, name),
    CONSTRAINT fk_supplier_store
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON public.suppliers USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON public.suppliers USING btree (email) WHERE (email IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers USING btree (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON public.suppliers USING btree (store_id);

DROP TRIGGER IF EXISTS update_supplier_updated_at ON public.suppliers;
CREATE TRIGGER update_supplier_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
