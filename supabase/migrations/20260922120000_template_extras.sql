-- Saved plans remember timed exercises and supersets.
--
-- A client's own plan is JSON, so timed sets ({ mode: "time", secs }) and
-- supersets ({ superset: "A" }) already save there with no schema change.
-- A saved plan (routine template) stores exercises as rows, so they need
-- somewhere to live:
--   extra  JSONB, e.g. { "mode": "time", "secs": 45 } or { "superset": "A" }
-- Per-set times go in the existing set_list JSONB ([{ "secs": 30 }, ...]).
--
-- Additive only: one nullable column. No existing row, policy or function
-- changes, nothing is deleted. Until it runs, saved plans still save; they
-- just don't keep timed/superset settings, and the editor says so.
-- Safe to run more than once.

ALTER TABLE public.routine_template_exercises
  ADD COLUMN IF NOT EXISTS extra JSONB;

NOTIFY pgrst, 'reload schema';
