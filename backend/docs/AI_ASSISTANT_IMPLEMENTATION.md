# BizTrack AI Assistant — Milestone 1

## Endpoint

`POST /api/ai/chat`

```json
{
  "message": "Kwa nini faida yangu imeshuka?",
  "conversationId": "optional-id-from-previous-response"
}
```

The response includes `conversationId`, `answer`, `toolsUsed`, `sources`, `confidence`, `provider`, `model`, and `providerError`.

## Initial verified tools

- `getSalesSummary`
- `getProfitAnalysis`
- `getTopProducts`

The assistant does not generate SQL. Backend routing selects approved tools and Gemini/OpenAI/Groq/Ollama explains only their verified results.

## Configuration

Use the existing AI provider variables. Optional conversation memory expiry:

```env
AI_CONVERSATION_TTL_MINUTES=60
```

Conversation memory is currently in process memory and resets when the Node server restarts. Persistent database memory can be added in a later milestone.
