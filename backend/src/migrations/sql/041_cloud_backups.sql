-- =====================================================
-- Migration 041: Automatic cloud backups to Google Drive
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cloud_backups (
    id            SERIAL PRIMARY KEY,
    date_key      DATE NOT NULL,
    file_name     TEXT NOT NULL,
    drive_file_id TEXT,
    size_bytes    BIGINT,
    -- running | success | failed | deleted (deleted = removed by retention)
    status        TEXT NOT NULL DEFAULT 'running',
    -- scheduled | manual
    triggered_by  TEXT NOT NULL DEFAULT 'scheduled',
    -- pg_dump | js_fallback
    method        TEXT,
    error         TEXT,
    created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cloud_backups_date_key
    ON public.cloud_backups(date_key);

CREATE INDEX IF NOT EXISTS idx_cloud_backups_status_created
    ON public.cloud_backups(status, created_at);
