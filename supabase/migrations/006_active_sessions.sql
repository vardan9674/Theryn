-- ============================================================================
-- Theryn — Migration 006: Active Sessions Heartbeat
-- Used by push_template_update to detect athletes mid-workout.
-- ============================================================================

CREATE TABLE active_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at  TIMESTAMPTZ DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  -- Heartbeat: updated every time athlete logs a set
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (athlete_id, started_at)
);

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes manage own active sessions"
  ON active_sessions FOR ALL
  USING  (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Coaches read active sessions"
  ON active_sessions FOR SELECT
  USING (is_coach_of(athlete_id, 'view'));

-- Auto-cleanup stale sessions older than 12h (defensive; normally ended properly)
CREATE INDEX IF NOT EXISTS idx_active_sessions_athlete
  ON active_sessions (athlete_id, ended_at);
