-- ============================================================================
-- Name-only clients ("not on the app yet")
-- A coach can add a person by first and last name before that person has an
-- account. The row carries the client's plan, fee and payments as JSON so the
-- coach can build and export a program and keep the ledger. When the person
-- joins with the coach's code, the app copies everything onto the real account
-- and deletes this row (see src/coach/data/supabaseCoachData.js linkManualClient).
--
-- Apply: paste into the Supabase SQL editor (see docs/OBSERVABILITY.md), or
-- `supabase db push` once migration history is reconciled (Roadmap 0.3).
-- ============================================================================

CREATE TABLE IF NOT EXISTS coach_manual_clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 60),
  last_name   TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 60),
  plan        JSONB,                          -- weekly plan, same shape as the app's routine templates
  fee         JSONB,                          -- { amount, currency, cadence, start_date, active }
  payments    JSONB NOT NULL DEFAULT '[]',    -- [{ id, amount, currency, received_date, notes }]
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_manual_clients_coach ON coach_manual_clients(coach_id);

ALTER TABLE coach_manual_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach manages own manual clients" ON coach_manual_clients;
CREATE POLICY "Coach manages own manual clients"
  ON coach_manual_clients
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE OR REPLACE FUNCTION coach_manual_clients_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coach_manual_clients_touch ON coach_manual_clients;
CREATE TRIGGER trg_coach_manual_clients_touch
  BEFORE UPDATE ON coach_manual_clients
  FOR EACH ROW EXECUTE FUNCTION coach_manual_clients_touch();
