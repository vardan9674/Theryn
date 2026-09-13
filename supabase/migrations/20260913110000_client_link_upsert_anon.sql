-- client_link_upsert is for signed-in coaches only. Supabase's default
-- privileges granted EXECUTE to anon when it was created, and the original
-- `REVOKE ... FROM PUBLIC` does not undo a direct grant. The function already
-- raises 'forbidden' without a session; this closes the door properly.
-- Applied to production 2026-09-12.

REVOKE EXECUTE ON FUNCTION client_link_upsert(UUID, UUID, TEXT, TEXT, TEXT[]) FROM anon;
