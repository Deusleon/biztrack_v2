-- =====================================================
-- Migration 021: SMS Gateway Integrations
-- =====================================================

-- Integrations table: stores encrypted/masked credentials for third-party gateways
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    provider VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'sms',
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT integrations_pkey PRIMARY KEY (id),
    CONSTRAINT integrations_provider_type_key UNIQUE (provider, type)
);

-- Seed the two SMS providers with empty config
INSERT INTO public.integrations (provider, type, config, is_active)
VALUES
  ('beem_africa', 'sms', '{}', false),
  ('next_sms',    'sms', '{}', false)
ON CONFLICT (provider, type) DO NOTHING;
