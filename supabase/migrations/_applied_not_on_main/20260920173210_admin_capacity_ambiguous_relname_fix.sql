-- pg_class and pg_stat_user_tables both expose relname, which made the table
-- listing fail with "column reference relname is ambiguous". Qualify both.
CREATE OR REPLACE FUNCTION admin_capacity()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE result JSONB;
BEGIN
  PERFORM assert_admin();

  SELECT jsonb_build_object(
    'db_bytes',    pg_database_size(current_database()),
    'connections', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
    'max_connections', current_setting('max_connections')::int,
    'tables', (
      SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.bytes DESC), '[]'::jsonb) FROM (
        -- Both pg_class and pg_stat_user_tables expose relname; qualify it.
        SELECT c.relname AS table_name,
               pg_total_relation_size(c.oid) AS bytes,
               s.n_live_tup AS approx_rows
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
         WHERE n.nspname = 'public' AND c.relkind = 'r'
         ORDER BY pg_total_relation_size(c.oid) DESC
         LIMIT 12
      ) t
    ),
    'cache_hit_ratio', (
      SELECT round(sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 1)
        FROM pg_statio_user_tables
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION admin_capacity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_capacity() TO authenticated, service_role;
