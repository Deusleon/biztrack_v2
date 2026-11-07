# BizTrack AI Milestone 2

## Database upgrade

Run pending migrations before starting the updated backend:

```bash
node DB/migrations/migrate.js --status
node DB/migrations/migrate.js
```

Migration `038_ai_conversations.sql` creates `ai_conversations` and `ai_messages` only. It does not modify or delete existing business data.

## New endpoints

- `GET /api/ai/conversations`
- `GET /api/ai/conversations/:id`
- `DELETE /api/ai/conversations/:id`
- `POST /api/ai/chat`

Conversation access is restricted by both the authenticated user and current store.
