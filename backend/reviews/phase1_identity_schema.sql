-- Read-only identity-contract export. Run this as one query in staging and
-- export all four rows as JSON before applying the core RLS migration.

WITH relevant_tables(table_name) AS (
  VALUES ('profiles'), ('projects'), ('project_role_assignments'), ('pm_projects'),
    ('sites'), ('site_manager_sites'), ('site_workers'), ('workers'), ('worker_details'),
    ('attendance'), ('materials'), ('site_materials'), ('material_requests'),
    ('purchase_orders'), ('notifications'), ('salary_slips'), ('milestones'),
    ('milestone_media'), ('milestone_notes'), ('client_messages'), ('messages'),
    ('shared_documents'), ('client_activity'), ('issues'), ('project_expenses')
), required_columns(table_name, column_name) AS (
  VALUES
    ('profiles','id'), ('profiles','role'),
    ('projects','id'), ('projects','pm_id'), ('projects','client_id'),
    ('project_role_assignments','project_id'), ('project_role_assignments','user_id'),
    ('pm_projects','project_id'), ('pm_projects','pm_id'),
    ('sites','id'), ('sites','project_id'), ('sites','site_manager_id'),
    ('site_manager_sites','id'), ('site_manager_sites','project_id'), ('site_manager_sites','site_manager_id'),
    ('workers','id'), ('workers','user_id'), ('site_workers','worker_id'), ('site_workers','project_id'),
    ('attendance','worker_id'), ('attendance','site_id'),
    ('materials','id'), ('materials','project_id'),
    ('site_materials','site_id'), ('site_materials','material_id'),
    ('material_requests','project_id'), ('material_requests','requested_by'),
    ('purchase_orders','project_id'), ('purchase_orders','supplier_id'),
    ('notifications','target_user_id'), ('notifications','target_role'), ('notifications','is_read'),
    ('salary_slips','worker_id'), ('milestones','id'), ('milestones','project_id'),
    ('milestone_media','milestone_id'), ('milestone_media','uploaded_by'),
    ('milestone_notes','milestone_id'), ('milestone_notes','author_id'),
    ('client_messages','project_id'), ('client_messages','sender_id'), ('client_messages','receiver_id'),
    ('messages','project_id'), ('messages','sender_id'), ('messages','receiver_id'),
    ('shared_documents','project_id'), ('shared_documents','uploaded_by'),
    ('client_activity','project_id'), ('client_activity','client_id'),
    ('issues','site_id'), ('issues','reported_by'), ('project_expenses','project_id')
)
SELECT '01_columns' AS audit_section,
       coalesce(jsonb_agg(to_jsonb(rows) ORDER BY rows.table_name, rows.ordinal_position), '[]'::jsonb) AS details
FROM (
  SELECT c.table_name, c.ordinal_position, c.column_name, c.data_type,
         c.is_nullable, c.column_default
  FROM information_schema.columns c JOIN relevant_tables r USING (table_name)
  WHERE c.table_schema = 'public'
) rows
UNION ALL
SELECT '02_foreign_keys',
       coalesce(jsonb_agg(to_jsonb(rows) ORDER BY rows.table_name, rows.column_name), '[]'::jsonb)
FROM (
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table,
         ccu.column_name AS referenced_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  JOIN relevant_tables r ON r.table_name = tc.table_name
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
) rows
UNION ALL
SELECT '03_missing_required_columns',
       coalesce(jsonb_agg(to_jsonb(rows) ORDER BY rows.table_name, rows.column_name), '[]'::jsonb)
FROM (
  SELECT r.table_name, r.column_name
  FROM required_columns r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
  WHERE c.column_name IS NULL
) rows
UNION ALL
SELECT '04_identity_summary',
       coalesce(jsonb_agg(
         jsonb_build_object(
           'table_name', rows.table_name,
           'columns', rows.columns,
           'foreign_keys', rows.foreign_keys
         )
         ORDER BY CASE WHEN rows.table_name = 'site_workers' THEN 0 ELSE 1 END,
                  rows.table_name
       ), '[]'::jsonb)
FROM (
  SELECT t.table_name,
         (SELECT string_agg(c.column_name, ', ' ORDER BY c.ordinal_position)
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS columns,
         (SELECT string_agg(kcu.column_name || ' -> ' || ccu.table_name || '.' || ccu.column_name,
                            ', ' ORDER BY kcu.column_name)
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public' AND tc.table_name = t.table_name
            AND tc.constraint_type = 'FOREIGN KEY') AS foreign_keys
  FROM (SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('workers','site_workers','site_manager_sites','sites','attendance','salary_slips','notifications')) t
) rows
ORDER BY audit_section;
