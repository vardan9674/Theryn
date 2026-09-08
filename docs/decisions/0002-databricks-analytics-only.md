# 0002 — Databricks is for analytics, never for live app data

- Date: 2026-09-08
- Status: accepted

## Context
Goal to learn Databricks and data pipelines, and a question about using it instead of Supabase. The app's workload is transactional: small row reads and writes with sub-100 ms latency and per-user authorization. Lakehouses are built for batch scans across all data and do not provide row-level security or low-latency point reads.

## Decision
Databricks Free Edition becomes the analytics layer downstream of Postgres. A scheduled job copies tables to Delta tables; notebooks compute coach insights, adherence, volume, and retention across all athletes. It never serves a request from the app.

## Consequences
- Zero cost, and a real learning project with the app's own data (Roadmap Phase 2).
- The rule engine in `src/lib/coachInsights.js` can be ported to a notebook and later fed back through a `coach_insights` table.
- Export must be read-only against production and must not include the service-role key in any notebook.
