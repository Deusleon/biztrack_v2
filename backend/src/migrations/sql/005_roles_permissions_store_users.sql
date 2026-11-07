-- =====================================================
-- Migration 005: Roles, Permissions, Store Users
-- =====================================================

-- Permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    module VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_no INTEGER,
    CONSTRAINT permissions_pkey PRIMARY KEY (id),
    CONSTRAINT permissions_name_key UNIQUE (name)
);

-- Roles
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT roles_pkey1 PRIMARY KEY (id),
    CONSTRAINT roles_store_id_name_key UNIQUE (store_id, name),
    CONSTRAINT roles_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    store_id UUID NOT NULL,
    is_allowed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT role_permissions_role_id_permission_id_store_id_key
        UNIQUE (role_id, permission_id, store_id),
    CONSTRAINT role_permissions_permission_id_fkey
        FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE,
    CONSTRAINT role_permissions_role_id_fkey
        FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
    CONSTRAINT role_permissions_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

-- Store Users
CREATE TABLE IF NOT EXISTS public.store_users (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    role_id UUID,
    status BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    store_id UUID,
    user_id UUID,
    updated_at TIMESTAMPTZ,
    CONSTRAINT store_users_pkey PRIMARY KEY (id),
    CONSTRAINT store_users_role_id_fkey
        FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL,
    CONSTRAINT store_users_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT store_users_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trigger_update_store_users_updated_at ON public.store_users;
CREATE TRIGGER trigger_update_store_users_updated_at
    BEFORE UPDATE ON public.store_users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
