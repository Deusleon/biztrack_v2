# Phase 2 Explain Route Fix

This package restores the Milestone 5 Explain This backend on top of the Phase 2 Batch 1 tool ecosystem.

Restored:
- `POST /api/ai/explain`
- `aiController.explainReport`
- Sales, Profit, and Inventory report context adapters
- Explain service permission checks and AI audit logging

No database migration is required beyond the existing AI permissions/audit migration.
