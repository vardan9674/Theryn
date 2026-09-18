-- ============================================================================
-- Keep name-only clients' history (link check-ins) no matter what.
--
-- Before: client_submissions.manual_client_id and .link_id were ON DELETE
-- CASCADE, so removing a name-only client (or turning it into an account,
-- which deleted the row) deleted every workout and measurement they had sent.
--
-- After:
--   * Name-only clients are archived, never deleted, by the app
--     (archived_at). The list hides archived ones.
--   * The database refuses to delete a name-only client who has check-ins
--     (ON DELETE NO ACTION), as a backstop. NO ACTION, not RESTRICT: it is
--     checked at the end of the statement, so deleting a whole coach account
--     (which cascades to both the client and its check-ins) still works.
--   * A check-in survives its link being deleted (link_id SET NULL).
--   * Optional email per name-only client, so that later, when they sign in
--     with that same (verified) email, they can be offered their history.
--     Nothing is merged automatically; see docs/decisions/0007.
--   * linked_athlete_id records which account the history was moved to,
--     once that flow exists.
--
-- Additive and idempotent. No data is changed. Apply in the Supabase SQL
-- editor (migration history is not reconciled yet, roadmap 0.3).
-- ============================================================================

-- ── Name-only clients: email, archive, future link to an account ───────────
ALTER TABLE coach_manual_clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE coach_manual_clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE coach_manual_clients ADD COLUMN IF NOT EXISTS linked_athlete_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_manual_clients_email_format') THEN
    ALTER TABLE coach_manual_clients ADD CONSTRAINT coach_manual_clients_email_format
      CHECK (email IS NULL OR (length(email) <= 254 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  END IF;
END $$;

-- Looked up case-insensitively when someone signs in (later).
CREATE INDEX IF NOT EXISTS idx_coach_manual_clients_email ON coach_manual_clients (lower(email)) WHERE email IS NOT NULL;

-- ── Check-ins outlive their link and their name-only row ───────────────────
ALTER TABLE client_submissions ALTER COLUMN link_id DROP NOT NULL;

DO $$
DECLARE c TEXT;
BEGIN
  -- link_id: CASCADE -> SET NULL
  SELECT con.conname INTO c
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
   WHERE con.conrelid = 'public.client_submissions'::regclass AND con.contype = 'f' AND att.attname = 'link_id';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE client_submissions DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE client_submissions ADD CONSTRAINT client_submissions_link_id_fkey
    FOREIGN KEY (link_id) REFERENCES client_links(id) ON DELETE SET NULL;

  -- manual_client_id: CASCADE -> NO ACTION (blocks deleting a client with check-ins;
  -- a coach-account delete still cascades to both in one statement)
  c := NULL;
  SELECT con.conname INTO c
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
   WHERE con.conrelid = 'public.client_submissions'::regclass AND con.contype = 'f' AND att.attname = 'manual_client_id';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE client_submissions DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE client_submissions ADD CONSTRAINT client_submissions_manual_client_id_fkey
    FOREIGN KEY (manual_client_id) REFERENCES coach_manual_clients(id) ON DELETE NO ACTION;
END $$;

-- Check (read-only), after applying:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.client_submissions'::regclass AND contype = 'f';
--   -> link_id ... ON DELETE SET NULL; manual_client_id ... (no ON DELETE clause = NO ACTION)
