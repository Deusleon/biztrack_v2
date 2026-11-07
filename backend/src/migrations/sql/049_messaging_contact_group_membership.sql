-- path: backend/DB/migrations/scripts/049_messaging_contact_group_membership.sql
-- =====================================================
-- Migration 049: Contacts become global (per store) entities that can
-- belong to MULTIPLE groups at once, via a join table. This is required
-- so that adding a contact to a subgroup can also add it to the
-- subgroup's parent group automatically, and so a contact can be added
-- to several groups without being duplicated.
--
-- Previously messaging_contacts.group_id tied a contact to exactly one
-- group. This migration moves that into messaging_contact_groups and
-- drops the old column.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.messaging_contact_groups (
    contact_id  INTEGER NOT NULL REFERENCES public.messaging_contacts(id) ON DELETE CASCADE,
    group_id    INTEGER NOT NULL REFERENCES public.messaging_groups(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contact_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_messaging_contact_groups_group ON public.messaging_contact_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_messaging_contact_groups_contact ON public.messaging_contact_groups(contact_id);

-- Carry over existing single-group memberships (from before this migration)
INSERT INTO public.messaging_contact_groups (contact_id, group_id)
SELECT id, group_id FROM public.messaging_contacts
WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Also add each of those contacts to their group's PARENT group, if any,
-- to satisfy "a contact in a subgroup must also be in the parent group"
-- retroactively for pre-existing data.
INSERT INTO public.messaging_contact_groups (contact_id, group_id)
SELECT mcg.contact_id, g.parent_group_id
FROM public.messaging_contact_groups mcg
JOIN public.messaging_groups g ON g.id = mcg.group_id
WHERE g.parent_group_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.messaging_contacts DROP COLUMN IF EXISTS group_id;
