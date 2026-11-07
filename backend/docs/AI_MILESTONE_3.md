# BizTrack AI Milestone 3

Adds a standardized permission-aware tool registry, five new verified tools, capability discovery, and AI audit logging.

## Migration
`node DB/migrations/migrate.js` applies `039_ai_permissions_and_audit.sql`. Existing roles inherit AI permissions from equivalent existing permissions; no role names are used.

## Endpoints
- `GET /api/ai/capabilities`
- `GET /api/ai/audit-logs` (requires `ai_view_audit`)
- `POST /api/ai/chat` now enforces `ai_chat` and per-tool permissions.
