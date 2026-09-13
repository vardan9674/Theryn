-- ============================================================================
-- Fix: link_view / link_submit could not find digest()
--
-- On Supabase, pgcrypto is installed in the `extensions` schema, not `public`.
-- Both public link functions pin `search_path = public, pg_temp`, so every call
-- with a real token failed with:
--   function digest(text, unknown) does not exist   (42883)
-- Short tokens returned {ok:false, reason:"invalid"} before reaching digest(),
-- which is why the earlier smoke test looked fine.
--
-- Adding `extensions` to the pinned search_path is the standard Supabase fix;
-- anon cannot create objects there, so the SECURITY DEFINER hardening holds.
-- 20260912120000_client_links.sql is updated to match for fresh installs.
--
-- Apply in the Supabase SQL editor (or `supabase db query --linked -f`).
-- ============================================================================

ALTER FUNCTION link_view(TEXT)                SET search_path = public, extensions, pg_temp;
ALTER FUNCTION link_submit(TEXT, TEXT, JSONB) SET search_path = public, extensions, pg_temp;

-- Supabase's default privileges granted EXECUTE to anon when the function was
-- created, and `REVOKE ... FROM PUBLIC` does not undo a direct grant. The
-- function already raises 'forbidden' without a session; this just closes it.
REVOKE EXECUTE ON FUNCTION client_link_upsert(UUID, UUID, TEXT, TEXT, TEXT[]) FROM anon;
