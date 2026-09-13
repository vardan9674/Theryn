-- ============================================================================
-- Realtime for the coach dashboard
--
-- src/coach/data/supabaseCoachData.js subscribeLiveData listens for changes
-- on the tables below so a client's workout, weight, measurement or link
-- submission shows up on the coach's screen without a reload. Only messages,
-- conversation_reads and routines were ever added to the publication, so
-- those subscriptions never fired.
--
-- Row-level security still applies to every event: a coach only receives
-- rows the "Coaches can view ..." / "Coach reads own submissions" policies
-- let them select.
--
-- Apply in the Supabase SQL editor (or `supabase db query --linked -f`).
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['workout_sessions', 'body_weights', 'body_measurements', 'client_submissions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
