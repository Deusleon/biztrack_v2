-- Milestone 3: permission-based AI tools and audit logging.
-- Safe for existing installations. Permissions are granted from existing capabilities,
-- never from hard-coded role names.

INSERT INTO permissions (name, description, module, submodule, display_no)
VALUES
 ('ai_access', 'Access BizTrack AI workspace', 'BizTrack AI', 'General', 200),
 ('ai_chat', 'Ask questions in BizTrack AI', 'BizTrack AI', 'General', 201),
 ('ai_sales_insights', 'Access AI sales insights', 'BizTrack AI', 'Insights', 202),
 ('ai_profit_insights', 'Access AI profit insights', 'BizTrack AI', 'Insights', 203),
 ('ai_inventory_insights', 'Access AI inventory insights', 'BizTrack AI', 'Insights', 204),
 ('ai_customer_insights', 'Access AI customer and debt insights', 'BizTrack AI', 'Insights', 205),
 ('ai_expense_insights', 'Access AI expense insights', 'BizTrack AI', 'Insights', 206),
 ('ai_explain_reports', 'Use AI to explain verified reports', 'BizTrack AI', 'Actions', 207),
 ('ai_view_audit', 'View BizTrack AI audit activity', 'BizTrack AI', 'Administration', 208)
ON CONFLICT (name) DO UPDATE SET
 description = EXCLUDED.description,
 module = EXCLUDED.module,
 submodule = EXCLUDED.submodule,
 display_no = EXCLUDED.display_no;

CREATE TABLE IF NOT EXISTS ai_audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
 request_type VARCHAR(40) NOT NULL DEFAULT 'chat',
 question TEXT,
 tools_requested JSONB NOT NULL DEFAULT '[]'::jsonb,
 tools_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
 tools_denied JSONB NOT NULL DEFAULT '[]'::jsonb,
 provider VARCHAR(50),
 model VARCHAR(120),
 source VARCHAR(30),
 confidence VARCHAR(20),
 status VARCHAR(20) NOT NULL DEFAULT 'success',
 latency_ms INTEGER,
 input_tokens INTEGER,
 output_tokens INTEGER,
 error_message TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_store_created ON ai_audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_user_created ON ai_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_conversation ON ai_audit_logs(conversation_id);

-- Roles allowed to manage permissions receive all AI permissions.
INSERT INTO role_permissions (role_id, permission_id, store_id, is_allowed)
SELECT DISTINCT rp.role_id, aip.id, rp.store_id, TRUE
FROM role_permissions rp
JOIN permissions existing ON existing.id = rp.permission_id AND existing.name = 'manage_permissions'
CROSS JOIN permissions aip
WHERE rp.is_allowed = TRUE AND aip.name LIKE 'ai_%'
ON CONFLICT (role_id, permission_id, store_id) DO UPDATE SET is_allowed = TRUE;

-- Base AI access follows dashboard access.
INSERT INTO role_permissions (role_id, permission_id, store_id, is_allowed)
SELECT DISTINCT rp.role_id, aip.id, rp.store_id, TRUE
FROM role_permissions rp
JOIN permissions existing ON existing.id = rp.permission_id AND existing.name = 'view_dashboard'
JOIN permissions aip ON aip.name IN ('ai_access','ai_chat')
WHERE rp.is_allowed = TRUE
ON CONFLICT (role_id, permission_id, store_id) DO UPDATE SET is_allowed = TRUE;

-- Domain AI permissions inherit existing report/data permissions.
WITH mapping(ai_permission, existing_permission) AS (
 VALUES
  ('ai_sales_insights','view_sales_reports'),
  ('ai_sales_insights','view_sales_summary_report'),
  ('ai_profit_insights','view_profit_reports'),
  ('ai_inventory_insights','view_inventory'),
  ('ai_inventory_insights','view_inventory_reports'),
  ('ai_customer_insights','view_customers'),
  ('ai_customer_insights','view_credit_sales'),
  ('ai_expense_insights','view_expenses'),
  ('ai_expense_insights','view_expense_reports'),
  ('ai_explain_reports','view_sales_reports'),
  ('ai_explain_reports','view_profit_reports'),
  ('ai_explain_reports','view_inventory_reports')
)
INSERT INTO role_permissions (role_id, permission_id, store_id, is_allowed)
SELECT DISTINCT rp.role_id, aip.id, rp.store_id, TRUE
FROM mapping m
JOIN permissions existing ON existing.name = m.existing_permission
JOIN role_permissions rp ON rp.permission_id = existing.id AND rp.is_allowed = TRUE
JOIN permissions aip ON aip.name = m.ai_permission
ON CONFLICT (role_id, permission_id, store_id) DO UPDATE SET is_allowed = TRUE;
