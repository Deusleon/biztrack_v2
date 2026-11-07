-- Persistent BizTrack AI conversations and messages.
-- Safe for existing installations: creates new tables/indexes only.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL DEFAULT 'New conversation',
  last_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider VARCHAR(50),
  model VARCHAR(120),
  confidence VARCHAR(20),
  source VARCHAR(30),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_updated
  ON ai_conversations (store_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON ai_messages (conversation_id, created_at ASC);
