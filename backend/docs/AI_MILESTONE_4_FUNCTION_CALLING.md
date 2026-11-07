# BizTrack AI Milestone 4: Native Function Calling

## What changed

Gemini can now select one or more permission-approved BizTrack tools from the Tool Registry. The backend remains responsible for validation, permission checks, execution, limits, and audit logging.

## Safe execution flow

1. User sends a question to `POST /api/ai/chat`.
2. Only tools permitted for that user are declared to Gemini.
3. Gemini returns structured function calls and arguments.
4. BizTrack validates the tool name and arguments again.
5. BizTrack executes read-only verified tools with a timeout.
6. Function results are returned to Gemini for the final user-facing answer.
7. Selection strategy, calls, tools, errors, latency, and token usage are stored in the existing AI audit metadata.

## Guardrails

- No SQL generation.
- No direct model access to the database.
- Permission checks occur before declaration and again before execution.
- Unknown and malformed calls are rejected.
- Maximum tool calls and rounds are configurable.
- Controlled routing remains available as fallback.

## Environment

```env
AI_NATIVE_FUNCTION_CALLING=true
AI_MAX_TOOL_CALLS=4
AI_MAX_TOOL_ROUNDS=2
AI_TOOL_TIMEOUT_MS=10000
AI_TOOL_TEMPERATURE=0.2
```

## Database

No new migration is required for Milestone 4. Existing `ai_messages.metadata` and `ai_audit_logs.metadata` JSONB columns store the new native tool metadata.
