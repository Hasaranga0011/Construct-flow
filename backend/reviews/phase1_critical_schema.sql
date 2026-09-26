-- Read-only schema export required before replacing the current permissive RLS policies.
-- Run this alone in the same Supabase SQL project.

SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'profiles', 'projects', 'project_role_assignments', 'pm_projects',
    'sites', 'site_manager_sites', 'site_workers', 'workers', 'worker_details',
    'attendance', 'labour', 'materials', 'site_materials', 'material_requests',
    'purchase_orders', 'notifications', 'salary_slips', 'milestones',
    'milestone_media', 'milestone_notes', 'client_messages', 'messages',
    'shared_documents', 'client_activity', 'issues', 'project_expenses',
    'invoices', 'photos', 'site_media', 'estimations', 'quotations', 'payroll'
  )
ORDER BY c.table_name, c.ordinal_position;

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'profiles', 'projects', 'project_role_assignments', 'pm_projects',
    'sites', 'site_manager_sites', 'site_workers', 'workers', 'worker_details',
    'attendance', 'labour', 'materials', 'site_materials', 'material_requests',
    'purchase_orders', 'notifications', 'salary_slips', 'milestones',
    'milestone_media', 'milestone_notes', 'client_messages', 'messages',
    'shared_documents', 'client_activity', 'issues', 'project_expenses',
    'invoices', 'photos', 'site_media', 'estimations', 'quotations', 'payroll'
  )
ORDER BY tc.table_name, kcu.column_name;
