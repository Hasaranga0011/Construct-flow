-- Emergency Phase 1 hardening.
-- Run as the database owner in Supabase SQL Editor.
-- This removes anonymous data mutation privileges without changing table data,
-- authenticated grants, or existing policies. Review authenticated policies next.
BEGIN;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS qualified_name
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON TABLE %s FROM anon',
      table_record.qualified_name
    );
  END LOOP;
END
$$;

COMMIT;
