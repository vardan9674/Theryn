-- assert_admin() was still callable by anon via /rest/v1/rpc/assert_admin.
-- It leaks nothing, but it does not belong in the public API surface.
REVOKE ALL ON FUNCTION assert_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assert_admin() TO authenticated, service_role;
