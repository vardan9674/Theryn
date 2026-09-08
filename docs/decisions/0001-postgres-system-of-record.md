# 0001 — Postgres stays the system of record

- Date: 2026-09-08
- Status: accepted

## Context
The app's data is relational: 26 tables, foreign keys, row-level security policies, and 18 stored procedures that encode template assignment, exercise resolution, and the push outbox. The question was whether to move live data to a lakehouse (Databricks, Delta Lake) or a document store (Firebase) as part of leaving Supabase.

## Decision
Live application data stays in Postgres, defined entirely by versioned migration files in git. The hosting of that Postgres (Supabase cloud, self-hosted Supabase, or plain Postgres) is a separate, later decision.

## Consequences
- The existing schema, RLS, and RPC investment is kept.
- Migrations must be reconciled and timestamp-named so the schema can be restored anywhere (Roadmap 0.3).
- Any future backend move is a dump and restore plus an environment variable change, not a rewrite.
