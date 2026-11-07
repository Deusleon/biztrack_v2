-- path: backend/DB/migrations/scripts/047_sms_logs.sql
-- =====================================================
-- Migration 047: SMS logs (local record of every SMS sent,
-- independent of which gateway/provider handled it)
--
-- Meseji's own /sms/history only shows messages sent through Meseji;
-- NextSMS and Beem Africa have no equivalent endpoint at all. So the
-- Messaging > History tab reads from this local table instead of
-- proxying to any single provider's history API -- every send (from
-- any gateway) gets logged here.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sms_logs (
    id           SERIAL PRIMARY KEY,
    store_id     UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    gateway      VARCHAR(40) NOT NULL,
    recipient    VARCHAR(30) NOT NULL,
    message      TEXT NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('sent', 'failed')),
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_store ON public.sms_logs(store_id, created_at DESC);