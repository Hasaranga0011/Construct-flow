-- Apply after existing migrations. Run in one transaction; any error rolls back.
-- Existing financial/attendance records are never silently rewritten.
BEGIN;
-- The connected legacy schema has payroll periods but no project reference,
-- and timestamp attendance without a status column. Preserve old rows for review.
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS daily_rate numeric;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status text DEFAULT 'Present';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS suggested_price numeric;
ALTER TABLE public.worker_details ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"email":true,"in_app":true}'::jsonb;
CREATE TABLE IF NOT EXISTS public.material_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,unit text NOT NULL DEFAULT 'Units',
 category text NOT NULL DEFAULT 'General',reference_price numeric DEFAULT 0,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cf_material_catalog_identity ON public.material_catalog(name,unit);
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES public.material_catalog(id);
CREATE OR REPLACE FUNCTION public.cf_project_status(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE lower(replace(trim(value),'_',' '))
 WHEN 'active' THEN 'In Progress' WHEN 'in progress' THEN 'In Progress'
 WHEN 'planning' THEN 'Planning' WHEN 'completed' THEN 'Completed'
 WHEN 'on hold' THEN 'On Hold' WHEN 'cancelled' THEN 'Cancelled'
 WHEN 'archived' THEN 'Archived' ELSE value END;
$$;
ALTER TABLE public.notifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;


CREATE TABLE IF NOT EXISTS public.notification_receipts (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(notification_id,user_id)
);
ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receipt_owner ON public.notification_receipts;
CREATE POLICY receipt_owner ON public.notification_receipts FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.notification_receipts FROM anon,authenticated;
GRANT SELECT ON public.notification_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.cf_notification_visible(p_user uuid,p_role text,p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT public.cf_current_role() IS NOT NULL AND (p_user=auth.uid() OR (p_user IS NULL AND (p_target IS NULL OR public.cf_project_access(p_target)) AND (
   p_role='All' OR lower(replace(p_role,' ','_')) = public.cf_current_role()
   OR (public.cf_current_role()='super_admin' AND lower(replace(p_role,' ','_')) IN ('admin','super_admin'))
   OR (public.cf_current_role()='pm' AND lower(replace(p_role,' ','_')) IN ('manager','project_manager'))
 )));
$$;

CREATE OR REPLACE FUNCTION public.get_own_notifications()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT to_jsonb(n) || jsonb_build_object('is_read',r.user_id IS NOT NULL)
 FROM public.notifications n LEFT JOIN public.notification_receipts r
 ON r.notification_id=n.id AND r.user_id=auth.uid()
 WHERE auth.uid() IS NOT NULL AND public.cf_notification_visible(n.target_user_id,n.target_role,n.project_id)
 ORDER BY n.created_at DESC LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.mark_own_notifications_read(p_ids uuid[] DEFAULT NULL,p_all boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF cardinality(p_ids)>500 THEN RAISE EXCEPTION 'Too many notification IDs'; END IF;
 INSERT INTO public.notification_receipts(notification_id,user_id)
 SELECT n.id,auth.uid() FROM public.notifications n
 WHERE (p_all OR n.id=ANY(p_ids)) AND public.cf_notification_visible(n.target_user_id,n.target_role,n.project_id)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.get_own_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_own_notifications_read(uuid[],boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_own_notifications_read(uuid[],boolean) TO authenticated;

ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id);
ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS material_id uuid;
ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS quantity_used numeric;

CREATE OR REPLACE FUNCTION public.record_project_expense(p_project_id uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expense public.project_expenses%ROWTYPE; stock public.materials%ROWTYPE;
 qty numeric:=coalesce((p_data->>'quantity_used')::numeric,0);
 amount_value numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm')
 OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF amount_value IS NULL OR amount_value<0 OR amount_value::text IN ('NaN','Infinity','-Infinity')
 OR qty<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'title'),'') IS NULL THEN
 RAISE EXCEPTION 'Invalid expense'; END IF;
 -- Serialize all financial changes for this project.
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF nullif(p_data->>'purchase_order_id','') IS NOT NULL THEN
   RAISE EXCEPTION 'PO costs are already included in project financials; do not record them again as expenses';
 END IF;
 IF qty>0 THEN
   SELECT * INTO stock FROM public.materials WHERE id=(p_data->>'material_id')::uuid AND project_id=p_project_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Material does not belong to this project'; END IF;
   IF coalesce(stock.current_stock,0)<qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
   UPDATE public.materials SET current_stock=current_stock-qty WHERE id=stock.id;
 END IF;
 INSERT INTO public.project_expenses(project_id,title,description,amount,expense_date,category,material_id,quantity_used)
 VALUES(p_project_id,trim(p_data->>'title'),p_data->>'description',amount_value,
 coalesce((p_data->>'expense_date')::date,current_date),p_data->>'category',
 nullif(p_data->>'material_id','')::uuid,qty) RETURNING * INTO expense;
 -- The financial ledger trigger installed by the final migration refreshes total spend.
 RETURN to_jsonb(expense);
END $$;
REVOKE ALL ON FUNCTION public.record_project_expense(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_project_expense(uuid,jsonb) TO authenticated;

-- A database constraint prevents concurrent generation of duplicate payslips.
-- If duplicates already exist this migration stops, requiring explicit reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS salary_slips_worker_project_period
 ON public.salary_slips(worker_id,project_id,period_start,period_end);

CREATE OR REPLACE FUNCTION public.save_project_with_assignments(p_project_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved public.projects%ROWTYPE; old_project public.projects%ROWTYPE;
 role_name text:=public.cf_current_role(); pair record; assigned uuid; expected text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN ('super_admin','pm') THEN
 RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
 IF p_project_id IS NOT NULL THEN
   SELECT * INTO old_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
   IF role_name='pm' AND old_project.pm_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Not your project' USING ERRCODE='42501'; END IF;
 END IF;
 IF role_name='pm' AND ((p_data ? 'pm_id' AND nullif(p_data->>'pm_id','')::uuid IS DISTINCT FROM auth.uid())
   OR (p_data ? 'admins' AND jsonb_array_length(p_data->'admins')>0)) THEN
   RAISE EXCEPTION 'Only administrators can reassign managers or administrators' USING ERRCODE='42501'; END IF;
 IF p_project_id IS NULL AND role_name='pm' AND nullif(p_data->>'pm_id','')::uuid IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'PM assignment required' USING ERRCODE='42501'; END IF;
 FOR pair IN SELECT * FROM (VALUES ('pm_id','pm'),('client_id','client')) AS fields(key,role) LOOP
   assigned:=nullif(p_data->>pair.key,'')::uuid;
   IF assigned IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assigned
     AND (role=pair.role OR role IN ('super_admin','admin')) AND is_approved IS TRUE) THEN
     RAISE EXCEPTION 'Invalid or unapproved assignment for %',pair.key; END IF;
 END LOOP;
 IF p_project_id IS NULL THEN
   INSERT INTO public.projects(name,location,status,total_budget,start_date,end_date,pm_id,client_id,address,latitude,longitude)
   VALUES(trim(p_data->>'name'),trim(p_data->>'location'),public.cf_project_status(coalesce(p_data->>'status','Planning')),
   coalesce((p_data->>'total_budget')::numeric,0),(p_data->>'start_date')::date,(p_data->>'end_date')::date,
   nullif(p_data->>'pm_id','')::uuid,nullif(p_data->>'client_id','')::uuid,p_data->>'address',
   (p_data->>'latitude')::numeric,(p_data->>'longitude')::numeric) RETURNING * INTO saved;
 ELSE
   UPDATE public.projects SET name=coalesce(p_data->>'name',name),location=coalesce(p_data->>'location',location),
   status=public.cf_project_status(coalesce(p_data->>'status',status)),total_budget=coalesce((p_data->>'total_budget')::numeric,total_budget),
   start_date=coalesce((p_data->>'start_date')::date,start_date),end_date=coalesce((p_data->>'end_date')::date,end_date),
   pm_id=CASE WHEN p_data ? 'pm_id' THEN nullif(p_data->>'pm_id','')::uuid ELSE pm_id END,
   client_id=CASE WHEN p_data ? 'client_id' THEN nullif(p_data->>'client_id','')::uuid ELSE client_id END,
   address=coalesce(p_data->>'address',address),latitude=coalesce((p_data->>'latitude')::numeric,latitude),
   longitude=coalesce((p_data->>'longitude')::numeric,longitude)
   WHERE id=p_project_id RETURNING * INTO saved;
 END IF;
 UPDATE public.projects SET
 image_url=CASE WHEN p_data ? 'image_url' THEN p_data->>'image_url' ELSE image_url END,
 images=CASE WHEN p_data ? 'images' THEN p_data->'images' ELSE images END,
 description=CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE description END,
 is_test=CASE WHEN p_data ? 'is_test' THEN (p_data->>'is_test')::boolean ELSE is_test END
 WHERE id=saved.id RETURNING * INTO saved;
 IF nullif(trim(saved.name),'') IS NULL OR nullif(trim(saved.location),'') IS NULL
 OR saved.start_date IS NULL OR saved.end_date IS NULL OR saved.end_date<saved.start_date
 OR saved.total_budget IS NULL OR saved.total_budget<0 OR saved.total_budget::text IN ('NaN','Infinity','-Infinity')
 OR (saved.latitude IS NOT NULL AND (saved.latitude NOT BETWEEN -90 AND 90 OR saved.latitude::text IN ('NaN','Infinity','-Infinity')))
 OR (saved.longitude IS NOT NULL AND (saved.longitude NOT BETWEEN -180 AND 180 OR saved.longitude::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Invalid project fields'; END IF;
 IF saved.status IS NULL OR saved.status NOT IN ('Planning','In Progress','Completed','On Hold','Cancelled','Archived') THEN
 RAISE EXCEPTION 'Invalid project status'; END IF;
 DELETE FROM public.pm_projects WHERE project_id=saved.id;
 DELETE FROM public.project_role_assignments WHERE project_id=saved.id AND role IN ('pm','client');
 IF saved.pm_id IS NOT NULL THEN
 INSERT INTO public.pm_projects(project_id,pm_id) VALUES(saved.id,saved.pm_id);
 INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(saved.id,saved.pm_id,'pm') ON CONFLICT DO NOTHING;
 END IF;
 IF saved.client_id IS NOT NULL THEN
 INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(saved.id,saved.client_id,'client') ON CONFLICT DO NOTHING;
 END IF;
 FOR pair IN SELECT * FROM (VALUES ('site_managers','site_manager'),('workers','worker'),('suppliers','supplier'),('admins','admin')) AS fields(key,role) LOOP
   IF NOT p_data ? pair.key THEN CONTINUE; END IF;
   IF jsonb_typeof(p_data->pair.key)<>'array' THEN RAISE EXCEPTION 'Assignments must be arrays'; END IF;
   DELETE FROM public.project_role_assignments WHERE project_id=saved.id AND role=pair.role;
   IF pair.role='site_manager' THEN DELETE FROM public.site_manager_sites WHERE project_id=saved.id; END IF;
   IF pair.role='worker' THEN DELETE FROM public.site_workers WHERE project_id=saved.id; END IF;
   FOR assigned IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(p_data->pair.key) LOOP
     IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assigned AND is_approved IS TRUE
       AND (role=pair.role OR (pair.role='admin' AND role='super_admin'))) THEN
       RAISE EXCEPTION 'Invalid or unapproved % assignment',pair.role; END IF;
     INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(saved.id,assigned,pair.role) ON CONFLICT DO NOTHING;
     IF pair.role='site_manager' THEN INSERT INTO public.site_manager_sites(id,project_id,site_manager_id) VALUES(gen_random_uuid(),saved.id,assigned); END IF;
     IF pair.role='worker' THEN INSERT INTO public.site_workers(id,project_id,worker_id) VALUES(gen_random_uuid(),saved.id,assigned); END IF;
   END LOOP;
 END LOOP;
 IF p_data ? 'boq_data' OR p_data ? 'milestones' OR p_data ? 'boq_file_url' THEN
   PERFORM public.cf_save_project_payload(saved.id,p_data);
 END IF;
 SELECT * INTO saved FROM public.projects WHERE id=saved.id;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_project_with_assignments(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_project_with_assignments(uuid,jsonb) TO authenticated;

-- Re-check approval at the database boundary, including direct SDK requests.
CREATE OR REPLACE FUNCTION public.cf_current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN lower(replace(role,' ','_')) IN ('admin','super_admin') THEN 'super_admin'
 WHEN lower(replace(role,' ','_')) IN ('manager','project_manager','pm') THEN 'pm'
 ELSE lower(replace(role,' ','_')) END
 FROM public.profiles WHERE id=auth.uid() AND is_approved IS TRUE;
$$;

ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.material_catalog FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.material_catalog TO authenticated;
DROP POLICY IF EXISTS catalog_approved_read ON public.material_catalog;
CREATE POLICY catalog_approved_read ON public.material_catalog FOR SELECT TO authenticated USING(public.cf_current_role() IS NOT NULL);
DROP POLICY IF EXISTS catalog_managers_insert ON public.material_catalog;
CREATE POLICY catalog_managers_insert ON public.material_catalog FOR INSERT TO authenticated WITH CHECK(public.cf_current_role() IN ('super_admin','pm'));
DROP POLICY IF EXISTS catalog_managers_update ON public.material_catalog;
CREATE POLICY catalog_managers_update ON public.material_catalog FOR UPDATE TO authenticated USING(public.cf_current_role() IN ('super_admin','pm')) WITH CHECK(public.cf_current_role() IN ('super_admin','pm'));

CREATE OR REPLACE FUNCTION public.protect_profile_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND coalesce(auth.role(),'')<>'service_role'
 AND public.cf_current_role() IS DISTINCT FROM 'super_admin' AND
 (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved
 OR NEW.daily_rate IS DISTINCT FROM OLD.daily_rate OR NEW.id IS DISTINCT FROM OLD.id) THEN
 RAISE EXCEPTION 'Only administrators can change account authority or wage rates' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_authority ON public.profiles;
CREATE TRIGGER protect_profile_authority BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();

-- Client UI approvals are column-limited and pending-only; never grant broad updates.
CREATE OR REPLACE FUNCTION public.review_variation(p_id uuid,p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE variation public.variation_orders%ROWTYPE;
BEGIN
 SELECT * INTO variation FROM public.variation_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Variation not found' USING ERRCODE='P0002'; END IF;
 IF public.cf_current_role() IS DISTINCT FROM 'client' OR NOT EXISTS(
 SELECT 1 FROM public.projects WHERE id=variation.project_id AND client_id=auth.uid()) THEN
 RAISE EXCEPTION 'Only the project client may review this variation' USING ERRCODE='42501'; END IF;
 IF variation.status<>'Pending' THEN RAISE EXCEPTION 'Variation has already been reviewed'; END IF;
 UPDATE public.variation_orders SET status=CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END,
 approved_by=auth.uid(),updated_at=now() WHERE id=p_id RETURNING * INTO variation;
 IF p_approve THEN UPDATE public.projects SET total_budget=total_budget+variation.amount WHERE id=variation.project_id; END IF;
 RETURN to_jsonb(variation);
END $$;
REVOKE ALL ON FUNCTION public.review_variation(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_variation(uuid,boolean) TO authenticated;

COMMIT;
