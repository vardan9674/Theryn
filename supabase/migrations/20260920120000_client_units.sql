-- kg or lb per client, set by the coach.
--
-- Until now the whole dashboard used one setting from the coach's profile.
-- A coach with some clients in kg and some in lb needs it per client, so
-- coach_manual_clients gets one nullable column:
--   unit_system  'metric' (kg) or 'imperial' (lb); NULL = follow the coach's
--                own setting, which is what every client does today.
--
-- Additive only: one new nullable column. No existing row, policy or function
-- changes, and nothing is deleted. Weights already saved keep the unit they
-- were typed in (plans carry their own `units` stamp) and are converted when
-- read. Safe to run more than once.

ALTER TABLE public.coach_manual_clients
  ADD COLUMN IF NOT EXISTS unit_system TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_manual_clients_unit_system_check') THEN
    ALTER TABLE public.coach_manual_clients
      ADD CONSTRAINT coach_manual_clients_unit_system_check
      CHECK (unit_system IS NULL OR unit_system IN ('metric', 'imperial'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
