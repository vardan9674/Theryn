-- Fix for 20260912120000_client_links.sql, found on the first real link
-- (2026-09-12): every valid token failed with
--   function digest(text, unknown) does not exist
-- and the page said "This link doesn't work."
--
-- Why: on Supabase, pgcrypto (which provides digest()) is installed in the
-- `extensions` schema. link_view and link_submit pin search_path to
-- `public, pg_temp` for safety, so the function could not be found. Tokens
-- shorter than 20 characters returned 'invalid' before reaching digest(),
-- which is why a quick probe with a short token looked fine.
--
-- Fix: keep the pinned search_path (that is the security property) but add
-- `extensions` to it. No function bodies change.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.link_view(TEXT)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.link_submit(TEXT, TEXT, JSONB)
  SET search_path = public, extensions, pg_temp;

-- Check (run as anon or from the SQL editor): a made-up full-length token must
-- now come back as {"ok": false, "reason": "revoked"} rather than an error.
-- SELECT link_view('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE');
