-- path: backend/DB/migrations/scripts/048_messaging_groups_contacts_templates.sql
-- =====================================================
-- Migration 048: Messaging contact groups/subgroups, contacts, and
-- reusable SMS templates.
--
-- messaging_groups supports one level of subgroups via parent_group_id
-- (a group whose parent_group_id is NULL is a top-level group; a group
-- with a parent_group_id is a subgroup of it). Contacts belong to
-- exactly one group or subgroup.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.messaging_groups (
    id               SERIAL PRIMARY KEY,
    store_id         UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    parent_group_id  INTEGER REFERENCES public.messaging_groups(id) ON DELETE CASCADE,
    name             VARCHAR(120) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_groups_store ON public.messaging_groups(store_id);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_parent ON public.messaging_groups(parent_group_id);

CREATE TABLE IF NOT EXISTS public.messaging_contacts (
    id          SERIAL PRIMARY KEY,
    store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    group_id    INTEGER NOT NULL REFERENCES public.messaging_groups(id) ON DELETE CASCADE,
    name        VARCHAR(120),
    phone       VARCHAR(20) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_contacts_group ON public.messaging_contacts(group_id);
CREATE INDEX IF NOT EXISTS idx_messaging_contacts_store ON public.messaging_contacts(store_id);

CREATE TABLE IF NOT EXISTS public.sms_templates (
    id          SERIAL PRIMARY KEY,
    store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_store ON public.sms_templates(store_id);