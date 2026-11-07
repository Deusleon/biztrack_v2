-- =====================================================
-- Migration 008: Product Categories & Products
-- =====================================================

-- Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID,
    name TEXT DEFAULT '{"en": "", "sw": null}'::jsonb NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_categories_pkey PRIMARY KEY (id),
    CONSTRAINT product_categories_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trigger_update_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER trigger_update_product_categories_updated_at
    BEFORE UPDATE ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID,
    category_id UUID,
    name TEXT DEFAULT '{"en": "", "sw": null}'::jsonb NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    minimum_stock NUMERIC(12,2),
    barcode VARCHAR(100),
    unit VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_store_barcode_unique UNIQUE (store_id, barcode),
    CONSTRAINT products_store_category_name_unit_unique UNIQUE (store_id, category_id, name, unit),
    CONSTRAINT products_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL,
    CONSTRAINT products_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON public.products;
CREATE TRIGGER trigger_update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
