-- Coach-set alternatives for an app athlete's exercises, and the athlete's equipment.
--
-- What it adds (both additive; no existing row, policy or function changes):
--   routine_exercises.extra  JSONB   e.g. {"alternatives":["Dumbbell Bench Press","Push-Up"]}
--                                    Saved plans already have this column (20260922120000);
--                                    app athletes' routines did not, so alternatives were
--                                    dropped on the way to the athlete.
--   profiles.equipment       TEXT[]  what the athlete can train with, so the exercise picker,
--                                    swap and quick workout only suggest things they can do.
--                                    Until this runs, the app keeps it on the device only.
--
-- Existing policies already cover both: routine_exercises is reached through its routine's
-- owner (and their coach), and profiles rows are the athlete's own.
-- Safe to run more than once.

ALTER TABLE public.routine_exercises
  ADD COLUMN IF NOT EXISTS extra JSONB;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipment TEXT[];

COMMENT ON COLUMN public.routine_exercises.extra IS
  'Per-exercise extras the coach set. Today: {"alternatives": ["name", ...]} (max 4), shown to the athlete when swapping.';
COMMENT ON COLUMN public.profiles.equipment IS
  'Equipment ids the athlete can use: barbell, dumbbell, cable, machine, body, ez, kettlebell, band, other.';

NOTIFY pgrst, 'reload schema';
