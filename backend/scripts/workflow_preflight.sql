-- Read-only diagnostics. Run against a staging clone before the 20261116 migrations.
-- Missing canonical columns and duplicate identities must be reconciled by an operator.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('profiles','projects','site_workers','site_manager_sites','materials',
 'purchase_orders','salary_slips','attendance','material_requests','milestones','milestone_media',
 'historical_projects','variation_orders','client_payment_schedule','public_inquiries')
ORDER BY table_name,ordinal_position;

SELECT 'attendance duplicate worker/site/day' AS issue,worker_id::text AS identity,count(*)
FROM public.attendance GROUP BY worker_id,site_id,date HAVING count(*)>1;
SELECT 'salary duplicate worker/project/period' AS issue,worker_id::text AS identity,count(*)
FROM public.salary_slips GROUP BY worker_id,project_id,period_start,period_end HAVING count(*)>1;
SELECT 'historical duplicate project/date' AS issue,project_name AS identity,count(*)
FROM public.historical_projects GROUP BY project_name,start_date HAVING count(*)>1;

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
SELECT conrelid::regclass AS table_name,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace='public'::regnamespace
AND contype IN ('c','f','u') ORDER BY conrelid::regclass::text,conname;
