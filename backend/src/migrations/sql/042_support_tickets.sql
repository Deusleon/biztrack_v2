-- =====================================================
-- Migration 042: Support tickets (raised in-app, reviewed by support team)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id            SERIAL PRIMARY KEY,
    ticket_number TEXT UNIQUE,
    -- Contact details (guests type them in; logged-in users are prefilled)
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT,
    -- Issue details
    category      TEXT NOT NULL DEFAULT 'other',   -- bug | billing | feature_request | question | other
    subject       TEXT NOT NULL,
    message       TEXT NOT NULL,
    -- open | in_progress | resolved | closed
    status        TEXT NOT NULL DEFAULT 'open',
    -- Linked automatically when the ticket is raised while logged in
    user_id       UUID REFERENCES public.users(id)  ON DELETE SET NULL,
    store_id      UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    -- Debug context captured automatically from the app (page, browser, app version)
    context       JSONB DEFAULT '{}'::jsonb,
    ip_address    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_email
    ON public.support_tickets(email);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
    ON public.support_tickets(user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
    ON public.support_tickets(status, created_at DESC);
