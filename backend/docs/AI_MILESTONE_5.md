# AI Milestone 5 — Explain This

## Endpoint
`POST /api/ai/explain`

Payload:
```json
{
  "reportType": "sales",
  "reportKey": "summary",
  "filters": { "startDate": "2026-07-01", "endDate": "2026-07-17" }
}
```

Supported report types: `sales`, `profit`, `inventory`.

The endpoint requires `ai_explain_reports` plus the relevant insight permission (`ai_sales_insights`, `ai_profit_insights`, or `ai_inventory_insights`). Context is rebuilt by the backend and is never trusted from frontend report rows.

No database migration is required. Explain requests are written to the existing `ai_audit_logs` table with request type `report_explain`.
