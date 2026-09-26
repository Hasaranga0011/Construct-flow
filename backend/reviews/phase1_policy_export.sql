-- Run this read-only export in the same Supabase SQL project.
-- Share the complete result rows before applying any RLS replacement migration.

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname
 AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname, p.policyname, p.cmd;

-- Also export all remaining anonymous privileges, including REFERENCES.
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;

-- Export the current Realtime publication membership.
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE schemaname = 'public'
ORDER BY pubname, tablename;
