-- ============================================================================
-- Theryn — Payments tracking (v1.6)
-- A manual payment log for coaches. We do NOT process money; we only record
-- what the coach has received. Two tables:
--   coach_client_fees   — expected fee per athlete (drives "outstanding")
--   coach_payments      — received payments, coach-entered
-- Plus profiles.default_currency so new fees auto-fill the coach's preference.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN profiles.default_currency IS
  'ISO-4217 code used to auto-fill new fee rows. Coach can override per athlete.';

-- ── COACH CLIENT FEES ──────────────────────────────────────────────────
-- One row per coach-athlete pair. Amount + cadence define what the coach
-- expects; start_date is the cycle anchor. active=false pauses reminders
-- without losing the config.
CREATE TABLE IF NOT EXISTS coach_client_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  cadence TEXT NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (coach_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_client_fees_coach
  ON coach_client_fees (coach_id) WHERE active;

ALTER TABLE coach_client_fees ENABLE ROW LEVEL SECURITY;

-- Coach owns their fee rows entirely.
CREATE POLICY "Coach manages own client fees"
  ON coach_client_fees FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Athletes may read their own fee so a future athlete-side payments screen
-- can display it. No write access.
CREATE POLICY "Athletes read own fee"
  ON coach_client_fees FOR SELECT
  USING (athlete_id = auth.uid());


-- ── COACH PAYMENTS ─────────────────────────────────────────────────────
-- Manual log of received payments. Each row is one receipt — no processing,
-- no gateway, no reconciliation. Currency per-row so a coach with clients
-- in multiple countries can track correctly.
CREATE TABLE IF NOT EXISTS coach_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_payments_coach_date
  ON coach_payments (coach_id, received_date DESC);

CREATE INDEX IF NOT EXISTS idx_coach_payments_athlete
  ON coach_payments (athlete_id);

ALTER TABLE coach_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages own payments"
  ON coach_payments FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Athletes can see rows that credit them (transparency — "did my coach log
-- my payment?"). Read only.
CREATE POLICY "Athletes read payments crediting them"
  ON coach_payments FOR SELECT
  USING (athlete_id = auth.uid());

COMMENT ON TABLE coach_client_fees IS
  'Per coach-athlete fee config. Drives expected-revenue math and overdue flags.';
COMMENT ON TABLE coach_payments IS
  'Manual payment log entered by coach. Never processes money — record only.';
