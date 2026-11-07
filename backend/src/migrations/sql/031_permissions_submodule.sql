-- =====================================================
-- Migration 031: Add submodule column to permissions
-- =====================================================

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS submodule VARCHAR(100);
