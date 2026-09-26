-- Read-only staging preflight: run this entire file in Supabase SQL Editor.
-- Returns ONE result set with nine named sections; export all nine rows as JSON.
-- Metadata only: no business records, passwords, keys, or JWTs.
-- A single SELECT keeps every section in the same statement snapshot.
-- Command coverage counts policies; it does not prove role isolation.

SELECT '01_tables' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT c.relname AS table_name, c.relkind, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v')
ORDER BY c.relname
) AS audit_rows
UNION ALL
SELECT '02_columns' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
) AS audit_rows
UNION ALL
SELECT '03_constraints' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT c.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' ORDER BY c.relname, con.conname
) AS audit_rows
UNION ALL
SELECT '04_policies' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd, policyname
) AS audit_rows
UNION ALL
SELECT '05_command_coverage' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
WITH commands(command) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'))
SELECT c.relname AS table_name, commands.command,
       count(p.policyname) AS applicable_policies,
       bool_or(coalesce(p.qual, '') IN ('true','(true)')
            OR coalesce(p.with_check, '') IN ('true','(true)')) AS unconditional_policy
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN commands
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
 AND p.cmd IN (commands.command, 'ALL')
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
GROUP BY c.relname, commands.command ORDER BY c.relname, commands.command
) AS audit_rows
UNION ALL
SELECT '06_triggers' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT event_object_table AS table_name, trigger_name, action_timing,
       event_manipulation, action_statement
FROM information_schema.triggers WHERE event_object_schema IN ('public','auth')
ORDER BY event_object_table, trigger_name
) AS audit_rows
UNION ALL
SELECT '07_routines' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT routine_name, security_type
FROM information_schema.routines WHERE routine_schema = 'public'
ORDER BY routine_name
) AS audit_rows
UNION ALL
SELECT '08_grants' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT grantee, table_name, privilege_type FROM information_schema.table_privileges
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type
) AS audit_rows
UNION ALL
SELECT '09_realtime_publication' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(audit_rows)), '[]'::jsonb) AS details
FROM (
SELECT pubname, schemaname, tablename FROM pg_publication_tables
WHERE schemaname = 'public' ORDER BY pubname, tablename
) AS audit_rows
ORDER BY audit_section;
