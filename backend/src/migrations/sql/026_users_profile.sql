-- =====================================================
-- Migration 026: Users Profile Extensions
-- =====================================================

-- Add phone and avatar_url columns to users table
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;
