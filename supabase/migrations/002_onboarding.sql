-- ============================================================================
-- Theryn — Onboarding migration (v1.5)
-- Adds height_cm + onboarding_completed to profiles so "have they done setup?"
-- is answered by the DB (not per-device localStorage), and so BMI can be
-- computed from height + latest body_weights entry.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Existing users: leave onboarding_completed = false on purpose. They will
-- see the new 3-field setup screen once on next sign-in, which captures the
-- height + weight we never had. If you want to skip the one-time prompt for
-- users who already have a name filled in, uncomment this:
--
--   UPDATE profiles SET onboarding_completed = true
--   WHERE display_name IS NOT NULL AND display_name <> '';
--
-- …but they'll have no height_cm → BMI won't show until they log it manually.

COMMENT ON COLUMN profiles.height_cm IS
  'User height in centimetres. Imperial-preferring users enter ft+in; the client converts.';

COMMENT ON COLUMN profiles.onboarding_completed IS
  'True once the user has provided name + height + initial weight. Source of truth for gating the setup screen (do NOT rely on localStorage).';
