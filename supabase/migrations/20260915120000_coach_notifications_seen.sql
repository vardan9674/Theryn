-- ============================================================================
-- Coach notification centre: when the coach last opened it.
--
-- The centre itself is built from rows that already exist (client_submissions
-- and workout_sessions); only the "seen" watermark is new. It lives on the
-- coach's own profile so the unread badge agrees across phone and laptop.
-- RLS: "Users can update own profile" already covers it.
--
-- Apply in the Supabase SQL editor (or `supabase db query --linked -f`).
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_notifications_seen_at TIMESTAMPTZ;

-- "Clear all": everything at or before this moment is hidden from the centre.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coach_notifications_cleared_at TIMESTAMPTZ;
