-- =====================================================
-- Migration 043: Support ticket replies (support team <-> user thread)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    message        TEXT NOT NULL,
    -- Support agent who wrote the reply
    author_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name    TEXT,
    -- Internal notes are visible to the support team only, never to the user
    is_internal    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket
    ON public.support_ticket_replies(ticket_id, created_at);