# 0003 — Stay on Supabase cloud free tier; self-host only with a concrete reason

- Date: 2026-09-08
- Status: accepted

## Context
Desire for an own-server setup and zero cost. Compared: Supabase cloud free tier, self-hosted Supabase on Oracle Cloud Always Free, plain Postgres with a hand-written API, PocketBase, Firebase. Supabase is open source, so self-hosting runs the same stack in Docker with the same client code.

## Decision
Stay on the Supabase cloud free tier for now. Self-host (Roadmap Phase 3) only when one of these is true: the free tier is outgrown, data ownership is required, or the 7-day idle pause becomes a problem.

## Consequences
- No ops burden while the codebase is being stabilized (Phase 0 and 1 come first).
- Free projects pause after 7 days without activity; a CI job or the analytics export should touch the database at least weekly.
- Because of decision 0001, moving later is a restore plus a redeploy.
- Two free projects are allowed, so a staging project is available at no cost (Roadmap 1.1).
