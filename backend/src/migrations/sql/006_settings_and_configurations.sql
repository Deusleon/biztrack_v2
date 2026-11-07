-- =====================================================
-- Migration 006: Settings & Configurations
-- =====================================================

-- Configurations (global key-value pairs)
CREATE TABLE IF NOT EXISTS public.configurations (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT configurations_pkey PRIMARY KEY (id),
    CONSTRAINT configurations_name_key UNIQUE (name)
);

-- Store Settings (per-store JSON settings)
CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    settings JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT store_settings_pkey PRIMARY KEY (id),
    CONSTRAINT store_settings_store_id_key UNIQUE (store_id),
    CONSTRAINT store_settings_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

-- System Settings (global JSON settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    settings JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);

-- Package Settings
CREATE TABLE IF NOT EXISTS public.package_settings (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    package_options JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT package_settings_pkey PRIMARY KEY (id)
);

-- System Logs
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID,
    action TEXT NOT NULL,
    description TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    store_id UUID,
    CONSTRAINT system_logs_pkey PRIMARY KEY (id),
    CONSTRAINT system_logs_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL,
    CONSTRAINT system_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);
