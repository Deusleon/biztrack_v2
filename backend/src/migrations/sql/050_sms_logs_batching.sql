-- path: backend/DB/migrations/scripts/050_sms_logs_batching.sql
-- =====================================================
-- Migration 050: Batch tracking for sms_logs.
--
-- Every recipient of one "send" action (whether typed in free-form, or a
-- whole group/subgroup) now shares one batch_id, so the Recently Sent
-- table can show ONE row per send action (with a group name when it was
-- a group send) instead of one row per individual phone number.
--
-- group_name / recipient_name are denormalized snapshots taken at send
-- time, so the history still reads correctly even if the group is later
-- renamed/deleted or the contact is renamed/deleted.
-- =====================================================

ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES public.messaging_groups(id) ON DELETE SET NULL;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS group_name VARCHAR(120);
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(120);

-- Backfill: every existing row was its own one-recipient "batch".
UPDATE public.sms_logs SET batch_id = gen_random_uuid() WHERE batch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_batch_id ON public.sms_logs(batch_id);
