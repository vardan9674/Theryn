-- Saved plans get target weights and per-set targets, like a client's plan.
--
-- routine_template_exercises only had target_sets / target_reps. The new plan
-- editor lets a coach give each set its own reps and weight, so a saved plan
-- needs somewhere to keep them:
--   target_weight  the weight when every set is the same (or set 1's)
--   set_list       [{ "reps": "12", "weight": 60 }, ...] only when sets differ
--   weight_unit    'kg' or 'lb': the unit the coach typed the weights in
--
-- Additive only: three new nullable columns. No existing row, policy or
-- function changes, nothing is deleted. Old saved plans read exactly as before.
-- Safe to run more than once.

ALTER TABLE public.routine_template_exercises
  ADD COLUMN IF NOT EXISTS target_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS set_list      JSONB,
  ADD COLUMN IF NOT EXISTS weight_unit   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routine_template_exercises_weight_unit_check') THEN
    ALTER TABLE public.routine_template_exercises
      ADD CONSTRAINT routine_template_exercises_weight_unit_check CHECK (weight_unit IS NULL OR weight_unit IN ('kg', 'lb'));
  END IF;
END $$;

-- The app reads columns through PostgREST; make it see the new ones now.
NOTIFY pgrst, 'reload schema';
