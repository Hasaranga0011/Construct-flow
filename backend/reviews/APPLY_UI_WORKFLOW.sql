-- ConstructFlow workflow/UI activation. Run as owner after taking a backup.
-- One transaction; failure rolls back all changes. No business rows are deleted.
BEGIN;


-- SOURCE: 20261116_security_workflow_integrity.sql
-- Apply after existing migrations. Run in one transaction; any error rolls back.
-- Existing financial/attendance records are never silently rewritten.

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



-- SOURCE: 20261116_workflow_receipts.sql
-- Quantity-aware receipts with replay protection and an immutable movement ledger.

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS quantity_received numeric NOT NULL DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.delivery_receipts(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),quantity numeric NOT NULL CHECK(quantity>0),
 received_by uuid NOT NULL REFERENCES auth.users(id),received_at timestamptz NOT NULL DEFAULT now(),note text
);
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receipt_project_read ON public.delivery_receipts;
CREATE POLICY receipt_project_read ON public.delivery_receipts FOR SELECT TO authenticated USING(public.cf_project_access(project_id));
REVOKE ALL ON public.delivery_receipts FROM anon,authenticated;
GRANT SELECT ON public.delivery_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_quantity(p_order_id uuid,p_quantity numeric DEFAULT NULL,p_receipt_id uuid DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE po public.purchase_orders%ROWTYPE; mat public.materials%ROWTYPE; cat public.material_catalog%ROWTYPE;
 qty numeric; receipt uuid:=coalesce(p_receipt_id,gen_random_uuid());
BEGIN
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm','site_manager')
 OR NOT (public.cf_can_manage_project(po.project_id) OR EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=po.project_id AND site_manager_id=auth.uid())) THEN
 RAISE EXCEPTION 'Only assigned project staff can receive goods' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_receipts WHERE id=receipt AND order_id=po.id) THEN RETURN to_jsonb(po); END IF;
 IF po.status='Received' THEN RETURN to_jsonb(po); END IF;
 IF po.status<>'Delivered' THEN RAISE EXCEPTION 'Supplier must report delivery before goods can be received'; END IF;
 PERFORM 1 FROM public.projects WHERE id=po.project_id FOR UPDATE;
 qty:=coalesce(p_quantity,po.quantity_ordered-po.quantity_received);
 IF qty<=0 OR qty>po.quantity_ordered-po.quantity_received OR qty::text IN ('NaN','Infinity','-Infinity') THEN
 RAISE EXCEPTION 'Received quantity exceeds outstanding quantity or is invalid'; END IF;
 SELECT * INTO mat FROM public.materials WHERE id=po.material_id::uuid AND project_id=po.project_id FOR UPDATE;
 IF NOT FOUND THEN
   SELECT * INTO cat FROM public.material_catalog WHERE id=po.material_id::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Order material is not a valid project material or catalog entry'; END IF;
   -- Serialize stock-row creation for distinct orders containing the same item.
   PERFORM 1 FROM public.projects WHERE id=po.project_id FOR UPDATE;
   SELECT * INTO mat FROM public.materials WHERE project_id=po.project_id AND catalog_id=cat.id LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN
     -- BOQ baselines may predate catalog links. Reuse matching stock, never duplicate it.
     SELECT * INTO mat FROM public.materials WHERE project_id=po.project_id AND catalog_id IS NULL
       AND lower(trim(name))=lower(trim(cat.name)) AND lower(trim(unit))=lower(trim(cat.unit)) LIMIT 1 FOR UPDATE;
     IF FOUND THEN
       UPDATE public.materials SET catalog_id=cat.id WHERE id=mat.id RETURNING * INTO mat;
     ELSE
       INSERT INTO public.materials(id,project_id,catalog_id,name,unit,current_stock,minimum_threshold,unit_price)
       VALUES(gen_random_uuid(),po.project_id,cat.id,cat.name,cat.unit,0,10,po.unit_price) RETURNING * INTO mat;
     END IF;
   END IF;
 END IF;
 UPDATE public.materials SET unit_price=CASE WHEN coalesce(current_stock,0)+qty>0
   THEN round((coalesce(current_stock,0)*coalesce(unit_price,0)+qty*po.unit_price)/(coalesce(current_stock,0)+qty),2)
   ELSE po.unit_price END,current_stock=coalesce(current_stock,0)+qty WHERE id=mat.id;
 INSERT INTO public.delivery_receipts(id,order_id,project_id,quantity,received_by,note) VALUES(receipt,po.id,po.project_id,qty,auth.uid(),p_note);
 UPDATE public.purchase_orders SET quantity_received=quantity_received+qty,
 status=CASE WHEN quantity_received+qty>=quantity_ordered THEN 'Received' ELSE 'Delivered' END,
 received_at=CASE WHEN quantity_received+qty>=quantity_ordered THEN now() ELSE received_at END,
 received_by=auth.uid() WHERE id=po.id RETURNING * INTO po;
 RETURN to_jsonb(po);
END $$;
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.receive_purchase_order_quantity(p_order_id) $$;
REVOKE ALL ON FUNCTION public.receive_purchase_order_quantity(uuid,numeric,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_quantity(uuid,numeric,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;


-- SOURCE: 20261116_workflow_reviews.sql
-- Requires 20261116_security_workflow_integrity.sql and preceding schema migrations.

ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id);
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.material_requests(id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_request_once ON public.purchase_orders(request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.review_material_request(p_request_id uuid,p_approve boolean,p_supplier_id uuid DEFAULT NULL,p_unit_price numeric DEFAULT 0,p_expected_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request public.material_requests%ROWTYPE; new_order public.purchase_orders%ROWTYPE; catalog uuid; supplier text;
BEGIN
 SELECT * INTO request FROM public.material_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002'; END IF;
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(request.project_id) THEN
 RAISE EXCEPTION 'Not your project request' USING ERRCODE='42501'; END IF;
 IF request.status<>'Pending Approval' THEN RAISE EXCEPTION 'Request has already been reviewed'; END IF;
 IF NOT p_approve THEN
   UPDATE public.material_requests SET status='Rejected',reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_request_id RETURNING * INTO request;
   RETURN to_jsonb(request);
 END IF;
 IF p_expected_date IS NULL OR p_expected_date < (now() AT TIME ZONE 'Asia/Colombo')::date OR p_unit_price<0
 OR p_unit_price::text IN ('NaN','Infinity','-Infinity') OR request.quantity<=0 THEN RAISE EXCEPTION 'Invalid order terms'; END IF;
 SELECT full_name INTO supplier FROM public.profiles WHERE id=p_supplier_id AND role='supplier' AND is_approved IS TRUE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.project_role_assignments WHERE project_id=request.project_id AND user_id=p_supplier_id AND role='supplier') THEN
 RAISE EXCEPTION 'Choose an approved supplier assigned to this project'; END IF;
 SELECT id INTO catalog FROM public.material_catalog WHERE lower(name)=lower(request.item_name) LIMIT 1;
 IF catalog IS NULL THEN
 INSERT INTO public.material_catalog(name,unit,category,reference_price) VALUES(request.item_name,request.unit,'General',p_unit_price) RETURNING id INTO catalog;
 END IF;
 INSERT INTO public.purchase_orders(project_id,supplier_id,supplier_name,material_id,quantity_ordered,unit_price,total_price,po_number,items,expected_date,status,request_id)
 VALUES(request.project_id,p_supplier_id,supplier,catalog,request.quantity,p_unit_price,round(request.quantity*p_unit_price,2),
 'PO-'||upper(substr(gen_random_uuid()::text,1,8)),request.item_name,p_expected_date,'Pending Delivery',p_request_id) RETURNING * INTO new_order;
 UPDATE public.material_requests SET status='Ordered',purchase_order_id=new_order.id,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_request_id;
 INSERT INTO public.notifications(user_id,target_user_id,target_role,project_id,title,message,type)
 VALUES(auth.uid(),p_supplier_id,'supplier',request.project_id,'New purchase order','Your assigned project has a new material order.','general');
 RETURN to_jsonb(new_order);
END $$;
REVOKE ALL ON FUNCTION public.review_material_request(uuid,boolean,uuid,numeric,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_material_request(uuid,boolean,uuid,numeric,date) TO authenticated;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_worker_site_day ON public.attendance(worker_id,site_id,date);

CREATE OR REPLACE FUNCTION public.review_attendance_period(p_project_id uuid,p_start date,p_end date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end>(now() AT TIME ZONE 'Asia/Colombo')::date THEN
 RAISE EXCEPTION 'Invalid attendance review period'; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance WHERE site_id IN (SELECT id FROM public.sites WHERE project_id=p_project_id)
 AND date BETWEEN p_start AND p_end AND check_in_time IS NOT NULL AND check_out_time IS NULL) THEN
 RAISE EXCEPTION 'Check out all workers before approving attendance'; END IF;
 UPDATE public.attendance SET reviewed_by=auth.uid(),reviewed_at=now()
 WHERE site_id IN (SELECT id FROM public.sites WHERE project_id=p_project_id) AND date BETWEEN p_start AND p_end;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.review_attendance_period(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_attendance_period(uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.invalidate_attendance_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.worker_id,NEW.site_id,NEW.date,NEW.check_in_time,NEW.check_out_time,NEW.hours_worked,NEW.overtime_hours,NEW.status)
 IS DISTINCT FROM (OLD.worker_id,OLD.site_id,OLD.date,OLD.check_in_time,OLD.check_out_time,OLD.hours_worked,OLD.overtime_hours,OLD.status) THEN
 NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL;
 END IF;
 IF NEW.hours_worked<0 OR NEW.overtime_hours<0 OR NEW.check_out_time<NEW.check_in_time THEN RAISE EXCEPTION 'Invalid attendance duration'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invalidate_attendance_review ON public.attendance;
CREATE TRIGGER invalidate_attendance_review BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.invalidate_attendance_review();

CREATE OR REPLACE FUNCTION public.guard_salary_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(NEW.project_id) THEN
 RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
 IF NEW.period_end<NEW.period_start THEN RAISE EXCEPTION 'Invalid salary period'; END IF;
 IF EXISTS(SELECT 1 FROM public.salary_slips WHERE worker_id=NEW.worker_id AND project_id=NEW.project_id
 AND period_start<=NEW.period_end AND period_end>=NEW.period_start) THEN
 RAISE EXCEPTION 'Overlapping payroll already exists' USING ERRCODE='23505'; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance a JOIN public.workers w ON w.id=a.worker_id
 JOIN public.sites s ON s.id=a.site_id WHERE s.project_id=NEW.project_id AND w.user_id=NEW.worker_id
 AND a.date BETWEEN NEW.period_start AND NEW.period_end AND a.reviewed_at IS NULL) THEN
 RAISE EXCEPTION 'Review attendance before generating payroll'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_salary_generation ON public.salary_slips;
CREATE TRIGGER guard_salary_generation BEFORE INSERT ON public.salary_slips FOR EACH ROW EXECUTE FUNCTION public.guard_salary_generation();

ALTER TABLE public.client_payment_schedule ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);
ALTER TABLE public.client_payment_schedule ADD COLUMN IF NOT EXISTS evidence text;
CREATE OR REPLACE FUNCTION public.verify_project_payment(p_id uuid,p_amount numeric,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payment public.client_payment_schedule%ROWTYPE;
BEGIN
 SELECT * INTO payment FROM public.client_payment_schedule WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE='P0002'; END IF;
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(payment.project_id) THEN
 RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
 IF payment.status NOT IN ('Pending','Overdue') OR p_amount IS DISTINCT FROM payment.amount OR length(trim(p_evidence))<10 THEN
 RAISE EXCEPTION 'Verify the full payment amount and evidence before marking paid'; END IF;
 UPDATE public.client_payment_schedule SET status='Paid',paid_at=now(),verified_by=auth.uid(),evidence=p_evidence,updated_at=now()
 WHERE id=p_id RETURNING * INTO payment;
 RETURN to_jsonb(payment);
END $$;
REVOKE ALL ON FUNCTION public.verify_project_payment(uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_project_payment(uuid,numeric,text) TO authenticated;


-- SOURCE: 20261116_workflow_security_boundaries.sql
-- New internal accounts require approval even when created via direct Supabase signup.

ALTER TABLE public.historical_projects ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);
ALTER TABLE public.historical_projects ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.historical_projects ALTER COLUMN verified SET DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS historical_project_identity ON public.historical_projects(project_name,start_date);
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_raw_role text;
  v_clean_role text;
  v_role text := 'pending';
  v_full_name text;
  v_contact text;
  v_approved boolean := false;
BEGIN
  -- Read role: prioritize raw_app_meta_data (server-set), fallback to raw_user_meta_data (signup-set)
  v_raw_role := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role'
  );

  IF v_raw_role IS NOT NULL THEN
    v_clean_role := lower(trim(replace(v_raw_role, ' ', '_')));
    IF v_clean_role IN ('super_admin', 'admin') THEN
      IF NEW.raw_app_meta_data->>'role' IN ('super_admin', 'admin') THEN
        v_role := 'super_admin';
      ELSE
        v_role := 'pending';
      END IF;
    ELSIF v_clean_role IN ('pm', 'project_manager', 'manager') THEN
      v_role := 'pm';
    ELSIF v_clean_role IN ('site_manager', 'sitemanager') THEN
      v_role := 'site_manager';
    ELSIF v_clean_role = 'worker' THEN
      v_role := 'worker';
    ELSIF v_clean_role = 'client' THEN
      v_role := 'client';
      v_approved := true;
    ELSIF v_clean_role = 'supplier' THEN
      v_role := 'supplier';
      v_approved := false; -- Suppliers require admin approval
    ELSE
      v_role := 'pending';
    END IF;
  ELSE
    v_role := 'pending';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_contact := NEW.raw_user_meta_data->>'contact_number';
  IF v_contact IS NOT NULL THEN
    v_contact := regexp_replace(v_contact, '[\s\-\(\)\.]', '', 'g');
    IF v_contact ~ '^0[1-9][0-9]{8}$' THEN
      v_contact := '+94' || substring(v_contact from 2);
    ELSIF v_contact ~ '^[1-9][0-9]{8}$' THEN
      v_contact := '+94' || v_contact;
    ELSIF v_contact !~ '^\+94[1-9][0-9]{8}$' THEN
      v_contact := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles(id, full_name, email, role, contact_number, is_approved)
  VALUES (NEW.id, v_full_name, NEW.email, v_role, v_contact, v_approved)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = CASE WHEN public.profiles.role IS NULL OR public.profiles.role = 'pending' THEN EXCLUDED.role ELSE public.profiles.role END,
    contact_number = COALESCE(EXCLUDED.contact_number, public.profiles.contact_number),
    is_approved = EXCLUDED.is_approved;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.cf_current_role();
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Approved account required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
   IF actor NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(NEW.project_id) THEN
     RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
   IF coalesce(NEW.quantity_received,0)<>0 OR NEW.received_at IS NOT NULL OR NEW.received_by IS NOT NULL THEN RAISE EXCEPTION 'New orders cannot contain receipt evidence'; END IF;
   IF NEW.status IS DISTINCT FROM 'Pending Delivery' THEN RAISE EXCEPTION 'New orders must await supplier confirmation'; END IF;
 ELSE
   IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
     RAISE EXCEPTION 'Order ownership is immutable'; END IF;
   IF NOT (actor='super_admin' OR public.cf_can_manage_project(OLD.project_id)
     OR (actor='supplier' AND OLD.supplier_id=auth.uid())
     OR (actor='site_manager' AND EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=OLD.project_id AND site_manager_id=auth.uid()))) THEN
     RAISE EXCEPTION 'Not your order' USING ERRCODE='42501'; END IF;
   IF actor='site_manager' AND ((NEW.quantity_ordered,NEW.unit_price,NEW.material_id,NEW.expected_date) IS DISTINCT FROM
     (OLD.quantity_ordered,OLD.unit_price,OLD.material_id,OLD.expected_date)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'Received')) THEN
     RAISE EXCEPTION 'Site managers may only confirm receipt' USING ERRCODE='42501'; END IF;
   IF actor='pm' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Confirmed','Rejected','Suggested') AND OLD.status<>'Suggested' THEN
     RAISE EXCEPTION 'Managers may only review supplier counter-offers'; END IF;
   IF actor='supplier' THEN
     IF (NEW.quantity_ordered,NEW.unit_price,NEW.material_id,NEW.total_price,NEW.expected_date)
       IS DISTINCT FROM (OLD.quantity_ordered,OLD.unit_price,OLD.material_id,OLD.total_price,OLD.expected_date) THEN
       RAISE EXCEPTION 'Suppliers must propose terms through a counter-offer'; END IF;
     IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status='Pending Delivery' AND NEW.status IN ('Confirmed','Rejected','Suggested'))
       OR (OLD.status='Confirmed' AND NEW.status='Delivered')) THEN
       RAISE EXCEPTION 'Supplier cannot approve its own counter-offer or reopen orders'; END IF;
   END IF;
   IF NEW.status='Delivered' AND OLD.status IS DISTINCT FROM 'Delivered' AND OLD.status<>'Confirmed' THEN
     RAISE EXCEPTION 'Confirm the order before delivery'; END IF;
   IF NEW.status='Delivered' AND NEW.status IS DISTINCT FROM OLD.status AND actor NOT IN ('supplier','super_admin') THEN
     RAISE EXCEPTION 'Supplier delivery confirmation required' USING ERRCODE='42501'; END IF;
   IF OLD.status IN ('Delivered','Received') AND (NEW.quantity_ordered,NEW.unit_price,NEW.total_price,NEW.material_id)
     IS DISTINCT FROM (OLD.quantity_ordered,OLD.unit_price,OLD.total_price,OLD.material_id) THEN
     RAISE EXCEPTION 'Delivered order terms are immutable'; END IF;
   IF OLD.status='Confirmed' AND NEW.status='Confirmed' AND (NEW.quantity_ordered,NEW.unit_price,NEW.material_id)
     IS DISTINCT FROM (OLD.quantity_ordered,OLD.unit_price,OLD.material_id) THEN
     RAISE EXCEPTION 'Confirmed terms require a counter-offer'; END IF;
   IF OLD.status IN ('Received','Rejected','Cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
     RAISE EXCEPTION 'Final orders cannot be reopened'; END IF;
   IF NEW.quantity_received IS DISTINCT FROM OLD.quantity_received OR (NEW.status='Received' AND OLD.status<>'Received') THEN
     IF actor NOT IN ('super_admin','pm','site_manager') OR NEW.quantity_received IS DISTINCT FROM (
       SELECT coalesce(sum(quantity),0) FROM public.delivery_receipts WHERE order_id=NEW.id)
       OR NEW.quantity_received>NEW.quantity_ordered OR (NEW.status='Received' AND NEW.quantity_received<>NEW.quantity_ordered) THEN
       RAISE EXCEPTION 'Stock receipts must use the quantity-aware receipt transaction'; END IF;
   END IF;
 END IF;
 IF NEW.status IS NULL OR NEW.status NOT IN ('Pending Delivery','Confirmed','Suggested','Rejected','Cancelled','Delivered','Received')
 OR NEW.quantity_ordered IS NULL OR NEW.unit_price IS NULL OR NEW.quantity_ordered<=0 OR NEW.unit_price<0 OR NEW.quantity_ordered::text IN ('NaN','Infinity','-Infinity')
 OR NEW.unit_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid order quantities or prices'; END IF;
 NEW.total_price:=round(NEW.quantity_ordered*NEW.unit_price,2);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_purchase_order_change ON public.purchase_orders;
CREATE TRIGGER guard_purchase_order_change BEFORE INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_change();

CREATE TABLE IF NOT EXISTS public.workflow_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,entity_id uuid,entity text NOT NULL,
 actor_id uuid,event text NOT NULL,previous jsonb,current jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workflow_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_project_read ON public.workflow_audit;
CREATE POLICY audit_project_read ON public.workflow_audit FOR SELECT TO authenticated
 USING(public.cf_current_role()='super_admin' OR public.cf_can_manage_project(project_id));
REVOKE ALL ON public.workflow_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workflow_audit TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_workflow_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.workflow_audit(project_id,entity_id,entity,actor_id,event,previous,current)
 VALUES(NEW.project_id,NEW.id,TG_TABLE_NAME,auth.uid(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_purchase_orders ON public.purchase_orders;
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_change();

-- Staff may submit requests, but approval and review evidence are RPC-only.
REVOKE UPDATE ON public.material_requests FROM authenticated;
GRANT UPDATE(item_name,quantity,unit) ON public.material_requests TO authenticated;
REVOKE UPDATE ON public.attendance FROM authenticated;
GRANT UPDATE(check_in_time,check_out_time,hours_worked,overtime_hours,status) ON public.attendance TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_reviewed_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='material_requests' THEN
   IF NEW.status IS DISTINCT FROM 'Pending Approval' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.purchase_order_id IS NOT NULL THEN
   RAISE EXCEPTION 'New material requests must await review'; END IF;
 ELSIF TG_TABLE_NAME='variation_orders' THEN
   IF NEW.status IS DISTINCT FROM 'Pending' OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'New variations must await client review'; END IF;
 ELSIF TG_TABLE_NAME='client_payment_schedule' THEN
   IF NEW.status IS DISTINCT FROM 'Pending' OR NEW.verified_by IS NOT NULL OR NEW.paid_at IS NOT NULL THEN RAISE EXCEPTION 'New payment schedules must await verification'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_reviewed_insert ON public.material_requests;
CREATE TRIGGER guard_reviewed_insert BEFORE INSERT ON public.material_requests FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_insert();
DROP TRIGGER IF EXISTS guard_reviewed_insert ON public.variation_orders;
CREATE TRIGGER guard_reviewed_insert BEFORE INSERT ON public.variation_orders FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_insert();
DROP TRIGGER IF EXISTS guard_reviewed_insert ON public.client_payment_schedule;
CREATE TRIGGER guard_reviewed_insert BEFORE INSERT ON public.client_payment_schedule FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_insert();

-- Reject unreviewed direct changes to payment verification and variation approvals.
-- The RPCs use owner privileges, while browser SDK mutations execute as authenticated.
REVOKE UPDATE ON public.client_payment_schedule FROM authenticated;
GRANT UPDATE(description,amount,due_date,updated_at) ON public.client_payment_schedule TO authenticated;
REVOKE UPDATE ON public.variation_orders FROM authenticated;
GRANT UPDATE(title,description,amount,updated_at) ON public.variation_orders TO authenticated;
CREATE OR REPLACE FUNCTION public.cf_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.cf_current_role();
$$;

CREATE OR REPLACE FUNCTION public.cf_project_access(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.cf_current_role() IS NOT NULL AND coalesce(
 public.cf_current_role()='super_admin'
 OR EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND auth.uid() IN (pm_id,client_id))
 OR EXISTS(SELECT 1 FROM public.project_role_assignments WHERE project_id=p_project_id AND user_id=auth.uid() AND role=public.cf_current_role())
 OR EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=p_project_id AND site_manager_id=auth.uid() AND public.cf_current_role()='site_manager')
 OR EXISTS(SELECT 1 FROM public.site_workers sw WHERE sw.project_id=p_project_id AND public.cf_current_role()='worker'
   AND (sw.worker_id=auth.uid() OR EXISTS(SELECT 1 FROM public.workers w WHERE w.id=sw.worker_id AND w.user_id=auth.uid())))
 OR EXISTS(SELECT 1 FROM public.purchase_orders WHERE project_id=p_project_id AND supplier_id=auth.uid() AND public.cf_current_role()='supplier'),false);
$$;

CREATE OR REPLACE FUNCTION public.guard_project_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'')='service_role' OR auth.uid() IS NULL THEN RETURN OLD; END IF;
 IF public.cf_current_role() IS DISTINCT FROM 'super_admin' THEN
 RAISE EXCEPTION 'Only administrators may delete projects' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_orders WHERE project_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.project_expenses WHERE project_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.salary_slips WHERE project_id=OLD.id) THEN
 RAISE EXCEPTION 'Archive projects with financial history instead of deleting them'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_project_delete ON public.projects;
CREATE TRIGGER guard_project_delete BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_delete();

-- Restrictive policies compose with legacy policies; an old permissive policy
-- cannot grant pending or disabled accounts access to operational tables.
DO $$ DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['projects','sites','site_workers','workers','site_manager_sites','project_role_assignments',
 'attendance','materials','material_requests','purchase_orders','salary_slips','site_reports','site_issues','project_expenses',
 'client_messages','notifications','variation_orders','client_payment_schedule'] LOOP
   IF to_regclass('public.'||table_name) IS NOT NULL THEN
     EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
     EXECUTE format('DROP POLICY IF EXISTS approved_account_required ON public.%I',table_name);
     EXECUTE format('CREATE POLICY approved_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.cf_current_role() IS NOT NULL) WITH CHECK (public.cf_current_role() IS NOT NULL)',table_name);
   END IF;
 END LOOP;
END $$;
DROP POLICY IF EXISTS scoped_project_visibility ON public.projects;
CREATE POLICY scoped_project_visibility ON public.projects AS RESTRICTIVE FOR SELECT TO authenticated USING(public.cf_project_access(id));
DO $$ DECLARE scoped_table text;
BEGIN
 FOREACH scoped_table IN ARRAY ARRAY['materials','material_requests','purchase_orders','site_reports','site_issues','project_expenses','client_messages','variation_orders','client_payment_schedule'] LOOP
   IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND information_schema.columns.table_name=scoped_table AND column_name='project_id') THEN
     EXECUTE format('DROP POLICY IF EXISTS project_scope_required ON public.%I',scoped_table);
     EXECUTE format('CREATE POLICY project_scope_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.cf_project_access(project_id)) WITH CHECK(public.cf_project_access(project_id))',scoped_table);
   END IF;
 END LOOP;
END $$;
DROP POLICY IF EXISTS scoped_notification_visibility ON public.notifications;
CREATE POLICY scoped_notification_visibility ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.cf_notification_visible(target_user_id,target_role,project_id));
REVOKE INSERT,UPDATE,DELETE ON public.notifications FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_attendance_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project uuid; person uuid; actor text:=public.cf_current_role();
BEGIN
 IF coalesce(auth.role(),'')='service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
 SELECT project_id INTO project FROM public.sites WHERE id=NEW.site_id;
 IF coalesce(actor,'') NOT IN ('super_admin','pm','site_manager') OR NOT public.cf_project_access(project) THEN
 RAISE EXCEPTION 'Assigned site staff required' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO person FROM public.workers WHERE id=NEW.worker_id;
 IF person IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=person AND role='worker' AND is_approved IS TRUE)
 OR NOT EXISTS(SELECT 1 FROM public.site_workers WHERE project_id=project AND worker_id IN (NEW.worker_id,person)) THEN
 RAISE EXCEPTION 'An approved worker assigned to this project is required'; END IF;
 IF NEW.date>(now() AT TIME ZONE 'Asia/Colombo')::date OR NEW.hours_worked<0 OR NEW.overtime_hours<0
 OR NEW.check_out_time<NEW.check_in_time THEN RAISE EXCEPTION 'Invalid attendance date or duration'; END IF;
 IF TG_OP='UPDATE' AND (NEW.worker_id,NEW.site_id,NEW.date) IS DISTINCT FROM (OLD.worker_id,OLD.site_id,OLD.date) THEN
 RAISE EXCEPTION 'Attendance identity is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_attendance_identity ON public.attendance;
CREATE TRIGGER guard_attendance_identity BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_identity();

-- Generic development SQL RPCs must never be callable by browser identities.
DO $$ DECLARE proc record;
BEGIN
 FOR proc IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('run_query','exec_sql','execute_sql','query_sql') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',proc.signature);
 END LOOP;
END $$;
DO $$ DECLARE private_table text;
BEGIN
 FOREACH private_table IN ARRAY ARRAY['profiles','projects','sites','site_workers','workers','site_manager_sites','project_role_assignments','pm_projects',
 'attendance','materials','site_materials','material_requests','purchase_orders','salary_slips','site_reports','site_issues','project_expenses',
 'milestones','milestone_media','milestone_notes','client_messages','messages','notifications','variation_orders','client_payment_schedule',
 'shared_documents','historical_projects','material_prices','public_inquiries'] LOOP
   IF to_regclass('public.'||private_table) IS NOT NULL THEN
     EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon',private_table);
   END IF;
 END LOOP;
END $$;


-- SOURCE: 20261116_workflow_z_milestones.sql

-- Reconcile the two legacy milestone schemas without removing stored media.
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS planned_date date;
ALTER TABLE public.milestone_media ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.milestone_media ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.milestone_media ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.milestone_media ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id);
UPDATE public.milestone_media SET url=coalesce(url,media_url),media_url=coalesce(media_url,url);
DO $$ DECLARE constraint_row record;
BEGIN
 FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid='public.milestones'::regclass
 AND contype='c' AND pg_get_constraintdef(oid) ~ '\mstatus\M' LOOP
 EXECUTE format('ALTER TABLE public.milestones DROP CONSTRAINT %I',constraint_row.conname);
 END LOOP;
END $$;
ALTER TABLE public.milestones ALTER COLUMN status SET DEFAULT 'Pending';
ALTER TABLE public.milestones ADD CONSTRAINT milestone_status_canonical CHECK(status IN ('Pending','In Progress','Completed')) NOT VALID;
CREATE OR REPLACE FUNCTION public.validate_milestone_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.status:=CASE lower(replace(NEW.status,' ','_')) WHEN 'not_started' THEN 'Pending' WHEN 'pending' THEN 'Pending'
 WHEN 'delayed' THEN 'In Progress' WHEN 'in_progress' THEN 'In Progress' WHEN 'completed' THEN 'Completed' ELSE NEW.status END;
 IF NEW.completion_percentage IS NULL THEN NEW.completion_percentage:=CASE WHEN NEW.status='Completed' THEN 100 ELSE 0 END; END IF;
 IF NEW.status IS NULL OR NEW.status NOT IN ('Pending','In Progress','Completed') OR NEW.completion_percentage<0 OR NEW.completion_percentage>100
 OR NEW.completion_percentage::text IN ('NaN','Infinity','-Infinity')
 OR (NEW.status='Completed' AND NEW.completion_percentage<>100) OR (NEW.status='Pending' AND NEW.completion_percentage<>0)
 OR (NEW.completion_percentage=100 AND NEW.status<>'Completed') THEN RAISE EXCEPTION 'Milestone status and percentage must agree'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_milestone_progress ON public.milestones;
CREATE TRIGGER validate_milestone_progress BEFORE INSERT OR UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.validate_milestone_progress();
CREATE OR REPLACE FUNCTION public.refresh_project_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=project FOR UPDATE;
 UPDATE public.projects SET completion_percentage=(SELECT coalesce(round(avg(coalesce(completion_percentage,CASE WHEN status='Completed' THEN 100 ELSE 0 END))),0)
 FROM public.milestones WHERE project_id=project) WHERE id=project;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS refresh_project_progress ON public.milestones;
CREATE TRIGGER refresh_project_progress AFTER INSERT OR UPDATE OR DELETE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.refresh_project_progress();

CREATE OR REPLACE FUNCTION public.update_project_milestone(p_project_id uuid,p_milestone_id uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE milestone public.milestones%ROWTYPE; status_value text:=p_data->>'status'; percentage numeric;
 recipient uuid; media text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm','site_manager')
 OR NOT public.cf_project_access(p_project_id) THEN RAISE EXCEPTION 'Assigned project staff required' USING ERRCODE='42501'; END IF;
 SELECT * INTO milestone FROM public.milestones WHERE id=p_milestone_id AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found' USING ERRCODE='P0002'; END IF;
 percentage:=coalesce((p_data->>'completion_percentage')::numeric,CASE WHEN status_value='Completed' THEN 100 WHEN status_value='Pending' THEN 0 ELSE milestone.completion_percentage END);
 IF status_value IS NULL OR percentage IS NULL OR status_value NOT IN ('Pending','In Progress','Completed') OR percentage<0 OR percentage>100
 OR percentage::text IN ('NaN','Infinity','-Infinity') OR (status_value='Completed' AND percentage<>100)
 OR (status_value='Pending' AND percentage<>0) THEN RAISE EXCEPTION 'Invalid milestone status or percentage'; END IF;
 UPDATE public.milestones SET status=status_value,completion_percentage=percentage,
 description=coalesce(p_data->>'description',description) WHERE id=p_milestone_id RETURNING * INTO milestone;
 IF p_data ? 'media_urls' AND jsonb_typeof(p_data->'media_urls')='array' THEN
   FOR media IN SELECT DISTINCT value FROM jsonb_array_elements_text(p_data->'media_urls') LOOP
     IF media !~ '^https://' THEN RAISE EXCEPTION 'Milestone media requires a secure storage URL'; END IF;
     INSERT INTO public.milestone_media(milestone_id,url,media_url,media_type,uploaded_by)
     SELECT p_milestone_id,media,media,'photo',auth.uid() WHERE NOT EXISTS(SELECT 1 FROM public.milestone_media WHERE milestone_id=p_milestone_id AND url=media);
   END LOOP;
 END IF;
 SELECT client_id INTO recipient FROM public.projects WHERE id=p_project_id;
 IF recipient IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,target_user_id,target_role,project_id,title,message,type)
 VALUES(auth.uid(),recipient,'client',p_project_id,'Milestone updated','Project milestone progress has been updated.','general');
 END IF;
 RETURN to_jsonb(milestone);
END $$;
REVOKE ALL ON FUNCTION public.update_project_milestone(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_project_milestone(uuid,uuid,jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.project_budget_alerts(
 project_id uuid REFERENCES public.projects(id),threshold_pct integer,created_at timestamptz DEFAULT now(),
 PRIMARY KEY(project_id,threshold_pct)
);
ALTER TABLE public.project_budget_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_budget_alerts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_budget_alerts TO authenticated;
DROP POLICY IF EXISTS project_budget_alerts_read ON public.project_budget_alerts;
CREATE POLICY project_budget_alerts_read ON public.project_budget_alerts FOR SELECT TO authenticated USING(public.cf_can_manage_project(project_id));

CREATE OR REPLACE FUNCTION public.refresh_project_spend(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE po_total numeric; wages numeric; expenses numeric; commitments numeric; budget numeric; manager uuid; threshold integer;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 SELECT coalesce(sum(CASE WHEN status='Received' THEN total_price
 WHEN status='Delivered' AND quantity_ordered>0 THEN total_price*least(1,quantity_received/quantity_ordered) ELSE 0 END),0)
 INTO po_total FROM public.purchase_orders WHERE project_id=p_project_id;
 SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) INTO wages FROM public.salary_slips WHERE project_id=p_project_id AND status='Paid';
 SELECT coalesce(sum(amount),0) INTO expenses FROM public.project_expenses WHERE project_id=p_project_id;
 UPDATE public.projects SET spent_cost=po_total+wages+expenses WHERE id=p_project_id;
 SELECT total_budget,pm_id INTO budget,manager FROM public.projects WHERE id=p_project_id;
 SELECT coalesce(sum(CASE WHEN status IN ('Pending Delivery','Confirmed') THEN total_price
 WHEN status='Delivered' AND quantity_ordered>0 THEN total_price*(1-least(1,quantity_received/quantity_ordered)) ELSE 0 END),0)
 INTO commitments FROM public.purchase_orders WHERE project_id=p_project_id;
 IF budget>0 THEN
   FOREACH threshold IN ARRAY ARRAY[90,100] LOOP
     IF (po_total+wages+expenses+commitments)/budget>=threshold/100.0 THEN
       INSERT INTO public.project_budget_alerts(project_id,threshold_pct) VALUES(p_project_id,threshold) ON CONFLICT DO NOTHING;
       IF FOUND THEN
         INSERT INTO public.notifications(user_id,target_role,project_id,title,message,type)
         VALUES(auth.uid(),'super_admin',p_project_id,'Budget '||threshold||'% Exceeded','Project commitments and actual spend reached '||threshold||'% of budget.','general');
         IF manager IS NOT NULL THEN
           INSERT INTO public.notifications(user_id,target_user_id,target_role,project_id,title,message,type)
           VALUES(auth.uid(),manager,'pm',p_project_id,'Budget '||threshold||'% Exceeded','Project commitments and actual spend reached '||threshold||'% of budget.','general');
         END IF;
       END IF;
     END IF;
   END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_project_spend(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.refresh_project_spend_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.refresh_project_spend(OLD.project_id);
 ELSE
   PERFORM public.refresh_project_spend(NEW.project_id);
   IF TG_OP='UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN PERFORM public.refresh_project_spend(OLD.project_id); END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS refresh_spend_orders ON public.purchase_orders;
CREATE TRIGGER refresh_spend_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.refresh_project_spend_trigger();
DROP TRIGGER IF EXISTS refresh_spend_expenses ON public.project_expenses;
CREATE TRIGGER refresh_spend_expenses AFTER INSERT OR UPDATE OR DELETE ON public.project_expenses FOR EACH ROW EXECUTE FUNCTION public.refresh_project_spend_trigger();
DROP TRIGGER IF EXISTS refresh_spend_payroll ON public.salary_slips;
CREATE TRIGGER refresh_spend_payroll AFTER INSERT OR UPDATE OR DELETE ON public.salary_slips FOR EACH ROW EXECUTE FUNCTION public.refresh_project_spend_trigger();


-- SOURCE: 20261116_workflow_zz_inquiries.sql

CREATE TABLE IF NOT EXISTS public.public_inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL,
 project_name text, message text NOT NULL, status text NOT NULL DEFAULT 'unread',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_inquiries FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE,DELETE ON public.public_inquiries TO authenticated;
DROP POLICY IF EXISTS inquiry_admin_boundary ON public.public_inquiries;
CREATE POLICY inquiry_admin_boundary ON public.public_inquiries AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.cf_current_role()='super_admin') WITH CHECK(public.cf_current_role()='super_admin');
DROP POLICY IF EXISTS inquiry_admin_access ON public.public_inquiries;
CREATE POLICY inquiry_admin_access ON public.public_inquiries FOR ALL TO authenticated
 USING(public.cf_current_role()='super_admin') WITH CHECK(public.cf_current_role()='super_admin');
-- Browser identities cannot bypass the API's validation and request limit.
CREATE OR REPLACE FUNCTION public.submit_public_inquiry(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inquiry uuid;
BEGIN
 IF length(trim(p_data->>'name')) NOT BETWEEN 2 AND 120
 OR length(trim(p_data->>'message')) NOT BETWEEN 10 AND 5000
 OR p_data->>'email' IS NULL THEN RAISE EXCEPTION 'Invalid inquiry'; END IF;
 INSERT INTO public.public_inquiries(name,email,project_name,message)
 VALUES(trim(p_data->>'name'),p_data->>'email',p_data->>'project_name',trim(p_data->>'message')) RETURNING id INTO inquiry;
 INSERT INTO public.notifications(user_id,target_user_id,target_role,title,message,type)
 SELECT id,id,'super_admin','New inquiry: '||trim(p_data->>'name'),
 'Email: '||(p_data->>'email')||E'\nProject: '||coalesce(p_data->>'project_name','N/A')||E'\n'||trim(p_data->>'message'),'general'
 FROM public.profiles WHERE role IN ('super_admin','admin') AND is_approved IS TRUE;
 RETURN inquiry;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_inquiry(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_inquiry(jsonb) TO service_role;


-- SOURCE: 20261116_workflow_zzz_project_payload.sql
-- Project creation and BOQ application must not report success with missing children.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS boq_data jsonb;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS quantity text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS status text;


CREATE OR REPLACE FUNCTION public.cf_save_project_payload(p_project_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; item jsonb; boq jsonb:=p_data->'boq_data';
 items jsonb; cursor_date date; due date; qty numeric; price numeric; title_value text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
   IF jsonb_typeof(boq)<>'object' THEN RAISE EXCEPTION 'Invalid BOQ payload'; END IF;
   UPDATE public.projects SET boq_data=boq WHERE id=p_project_id;
 END IF;
 items:=coalesce(nullif(p_data->'milestones','null'::jsonb),nullif(boq->'milestones','null'::jsonb),'[]'::jsonb);
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'Invalid milestone list'; END IF;
 cursor_date:=project.start_date;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   title_value:=trim(item->>'title');
   IF nullif(title_value,'') IS NULL OR length(title_value)>200 THEN RAISE EXCEPTION 'Milestone title required'; END IF;
   IF item ? 'due_date' AND nullif(item->>'due_date','') IS NOT NULL THEN due:=(item->>'due_date')::date;
   ELSIF coalesce((item->>'duration_days')::integer,0)>0 THEN cursor_date:=cursor_date+(item->>'duration_days')::integer; due:=cursor_date;
   ELSE due:=project.end_date; END IF;
   IF coalesce(item->>'status','Pending') NOT IN ('Pending','Not Started') OR coalesce((item->>'completion_percentage')::numeric,0)<>0 THEN
     RAISE EXCEPTION 'New project milestones must start pending'; END IF;
   INSERT INTO public.milestones(id,project_id,title,description,due_date,planned_date,status,completion_percentage)
   SELECT gen_random_uuid(),p_project_id,title_value,coalesce(item->>'description',''),due,due,'Pending',0
   WHERE NOT EXISTS(SELECT 1 FROM public.milestones WHERE project_id=p_project_id AND lower(trim(title))=lower(title_value));
 END LOOP;
 items:=coalesce(nullif(boq->'materials','null'::jsonb),'[]'::jsonb);
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'Invalid BOQ material list'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   title_value:=trim(item->>'name'); qty:=coalesce((item->>'allocated_quantity')::numeric,0); price:=coalesce((item->>'unit_price')::numeric,0);
   IF nullif(title_value,'') IS NULL OR qty<0 OR price<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Invalid BOQ material'; END IF;
   INSERT INTO public.materials(id,project_id,name,unit,current_stock,minimum_threshold,quantity,unit_price,category,status)
   SELECT gen_random_uuid(),p_project_id,title_value,coalesce(item->>'unit','units'),0,greatest(10,round(qty*0.1)),qty::text,price,coalesce(item->>'category','General'),'Pending Order'
   WHERE NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND lower(trim(name))=lower(title_value));
 END LOOP;
 IF nullif(p_data->>'boq_file_url','') IS NOT NULL THEN
   IF p_data->>'boq_file_url' !~ '^https://' THEN RAISE EXCEPTION 'BOQ document requires a secure storage URL'; END IF;
   INSERT INTO public.shared_documents(project_id,name,filename,file_name,category,file_url,url,status,uploaded_by)
   VALUES(p_project_id,'Bill of Quantities - '||project.name,'Bill of Quantities','Bill of Quantities','BOQ',p_data->>'boq_file_url',p_data->>'boq_file_url','Active',auth.uid());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.cf_save_project_payload(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_project_boq(p_project_id uuid,p_boq jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE budget numeric:=(p_boq->>'total_budget')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF budget IS NULL OR budget<=0 OR budget::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ budget'; END IF;
 PERFORM public.cf_save_project_payload(p_project_id,jsonb_build_object('boq_data',p_boq));
 UPDATE public.projects SET total_budget=budget WHERE id=p_project_id;
 PERFORM public.refresh_project_spend(p_project_id);
 RETURN jsonb_build_object('ok',true,'boq_data',p_boq);
END $$;
REVOKE ALL ON FUNCTION public.apply_project_boq(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_project_boq(uuid,jsonb) TO authenticated;


-- SOURCE: 20261117_project_commercial_ui.sql

-- Test-project events may reach their assigned test accounts, never role broadcasts.
CREATE OR REPLACE FUNCTION public.guard_test_project_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND is_test IS TRUE)
 AND NEW.target_user_id IS NULL THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_test_project_notification ON public.notifications;
CREATE TRIGGER guard_test_project_notification BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.guard_test_project_notification();
-- The legacy issue register is site-scoped, including client concerns.
DO $$ BEGIN
 IF to_regclass('public.issues') IS NOT NULL THEN
   ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.issues FROM PUBLIC,anon;
   DROP POLICY IF EXISTS approved_account_required ON public.issues;
   CREATE POLICY approved_account_required ON public.issues AS RESTRICTIVE FOR ALL TO authenticated
   USING(public.cf_current_role() IS NOT NULL) WITH CHECK(public.cf_current_role() IS NOT NULL);
   DROP POLICY IF EXISTS issue_project_boundary ON public.issues;
   CREATE POLICY issue_project_boundary ON public.issues AS RESTRICTIVE FOR ALL TO authenticated
   USING(EXISTS(SELECT 1 FROM public.sites WHERE id=issues.site_id AND public.cf_project_access(project_id)))
   WITH CHECK(EXISTS(SELECT 1 FROM public.sites WHERE id=issues.site_id AND public.cf_project_access(project_id)));
 END IF;
END $$;
DROP POLICY IF EXISTS project_manager_salary_read ON public.salary_slips;
CREATE POLICY project_manager_salary_read ON public.salary_slips FOR SELECT TO authenticated USING(public.cf_can_manage_project(project_id));
CREATE OR REPLACE FUNCTION public.create_project_commercial_record(p_project_id uuid,p_kind text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE record_value jsonb; amount_value numeric:=(p_data->>'amount')::numeric; label_value text:=trim(p_data->>'description');
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF amount_value IS NULL OR amount_value<=0 OR amount_value::text IN ('NaN','Infinity','-Infinity') OR nullif(label_value,'') IS NULL THEN
 RAISE EXCEPTION 'A description and positive amount are required'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_kind='payment' THEN
   IF p_data->>'due_date' IS NULL THEN RAISE EXCEPTION 'Payment due date required'; END IF;
   INSERT INTO public.client_payment_schedule(project_id,description,amount,due_date,status,created_by)
   VALUES(p_project_id,label_value,amount_value,(p_data->>'due_date')::date,'Pending',auth.uid()) RETURNING to_jsonb(client_payment_schedule.*) INTO record_value;
 ELSIF p_kind='variation' THEN
   IF nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Variation title required'; END IF;
   INSERT INTO public.variation_orders(project_id,title,description,amount,status,created_by)
   VALUES(p_project_id,trim(p_data->>'title'),label_value,amount_value,'Pending',auth.uid()) RETURNING to_jsonb(variation_orders.*) INTO record_value;
 ELSE RAISE EXCEPTION 'Invalid commercial record kind'; END IF;
 RETURN record_value;
END $$;
REVOKE ALL ON FUNCTION public.create_project_commercial_record(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_project_commercial_record(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_project_document(p_project_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; label_value text:=trim(p_data->>'name'); url_value text:=p_data->>'url';
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT public.cf_can_manage_project(p_project_id) THEN
 RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF nullif(label_value,'') IS NULL OR url_value IS NULL OR url_value !~ '^https://' THEN RAISE EXCEPTION 'Document name and secure URL required'; END IF;
 INSERT INTO public.shared_documents(project_id,name,filename,file_name,file_url,url,category,status,uploaded_by)
 VALUES(p_project_id,label_value,label_value,label_value,url_value,url_value,coalesce(p_data->>'category','General'),'Active',auth.uid()) RETURNING to_jsonb(shared_documents.*) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.attach_project_document(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attach_project_document(uuid,jsonb) TO authenticated;

DROP POLICY IF EXISTS commercial_payments_scope ON public.client_payment_schedule;
CREATE POLICY commercial_payments_scope ON public.client_payment_schedule FOR SELECT TO authenticated USING(public.cf_project_access(project_id));
DROP POLICY IF EXISTS commercial_variations_scope ON public.variation_orders;
CREATE POLICY commercial_variations_scope ON public.variation_orders FOR SELECT TO authenticated USING(public.cf_project_access(project_id));
CREATE INDEX IF NOT EXISTS cf_orders_project_status_date ON public.purchase_orders(project_id,status,expected_date);
CREATE INDEX IF NOT EXISTS cf_requests_project_created ON public.material_requests(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cf_payment_project_due ON public.client_payment_schedule(project_id,due_date);
CREATE INDEX IF NOT EXISTS cf_variation_project_created ON public.variation_orders(project_id,created_at DESC);


-- SOURCE: 20261117_role_flow_boundaries.sql
-- Review and apply in Supabase SQL Editor. No business records are deleted.

ALTER TABLE public.estimations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();
-- Do not guess ownership of old unlinked estimates; only administrators can see them.
ALTER TABLE public.estimations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.estimations FROM PUBLIC, anon;
DROP POLICY IF EXISTS estimation_role_scope ON public.estimations;
CREATE POLICY estimation_role_scope ON public.estimations AS RESTRICTIVE FOR SELECT TO authenticated
USING (
 public.cf_current_role()='super_admin'
 OR (public.cf_current_role()='pm' AND
     ((project_id IS NULL AND created_by=auth.uid()) OR
      (project_id IS NOT NULL AND public.cf_can_manage_project(project_id))))
 OR (public.cf_current_role()='client' AND (status='Approved' OR created_by=auth.uid()) AND
     EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.client_id=auth.uid()))
);
DROP POLICY IF EXISTS estimation_create_scope ON public.estimations;
CREATE POLICY estimation_create_scope ON public.estimations AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (created_by=auth.uid() AND status='Pending' AND (
 (public.cf_current_role() IN ('super_admin','pm') AND (project_id IS NULL OR public.cf_can_manage_project(project_id)))
 OR (public.cf_current_role()='client' AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.client_id=auth.uid()))
));
DROP POLICY IF EXISTS estimation_update_scope ON public.estimations;
CREATE POLICY estimation_update_scope ON public.estimations AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.cf_current_role()='super_admin' OR (public.cf_current_role()='pm' AND
 ((project_id IS NULL AND created_by=auth.uid()) OR public.cf_can_manage_project(project_id))))
WITH CHECK (public.cf_current_role()='super_admin' OR (public.cf_current_role()='pm' AND
 ((project_id IS NULL AND created_by=auth.uid()) OR public.cf_can_manage_project(project_id))));
DROP POLICY IF EXISTS estimation_delete_scope ON public.estimations;
CREATE POLICY estimation_delete_scope ON public.estimations AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.cf_current_role()='super_admin');

DROP POLICY IF EXISTS expense_financial_read_scope ON public.project_expenses;
CREATE POLICY expense_financial_read_scope ON public.project_expenses AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.cf_current_role()='super_admin' OR public.cf_can_manage_project(project_id));

DROP POLICY IF EXISTS payment_financial_read_scope ON public.client_payment_schedule;
CREATE POLICY payment_financial_read_scope ON public.client_payment_schedule AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.cf_current_role()='super_admin' OR public.cf_can_manage_project(project_id)
 OR (public.cf_current_role()='client' AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.client_id=auth.uid())));

DROP POLICY IF EXISTS variation_financial_read_scope ON public.variation_orders;
CREATE POLICY variation_financial_read_scope ON public.variation_orders AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.cf_current_role()='super_admin' OR public.cf_can_manage_project(project_id)
 OR (public.cf_current_role()='client' AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.client_id=auth.uid())));

NOTIFY pgrst, 'reload schema';


-- SOURCE: 20261117_boq_connected_workflow.sql
-- Run after all 20261117 workflow/role-boundary migrations. No business records deleted.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS boq_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.project_boq_lines(
 project_id uuid NOT NULL REFERENCES public.projects(id), id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('work','material','labour')), description text NOT NULL,
 stage text, unit text, quantity numeric NOT NULL DEFAULT 0 CHECK(quantity>=0),
 rate numeric NOT NULL DEFAULT 0 CHECK(rate>=0), amount numeric NOT NULL DEFAULT 0 CHECK(amount>=0),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(project_id,id)
);
CREATE TABLE IF NOT EXISTS public.project_boq_revisions(
 project_id uuid NOT NULL REFERENCES public.projects(id), revision integer NOT NULL,
 boq_data jsonb NOT NULL, reason text NOT NULL, changed_by uuid REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,revision)
);
CREATE TABLE IF NOT EXISTS public.project_boq_worker_rates(
 project_id uuid NOT NULL REFERENCES public.projects(id),worker_id uuid NOT NULL REFERENCES public.profiles(id),
 daily_rate numeric NOT NULL CHECK(daily_rate>=0 AND daily_rate::text NOT IN ('NaN','Infinity','-Infinity')),PRIMARY KEY(project_id,worker_id)
);
ALTER TABLE public.project_boq_worker_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_boq_worker_rates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_boq_worker_rates TO authenticated;
DROP POLICY IF EXISTS boq_worker_rates_read ON public.project_boq_worker_rates;
CREATE POLICY boq_worker_rates_read ON public.project_boq_worker_rates FOR SELECT TO authenticated USING(public.cf_can_manage_project(project_id) OR (public.cf_current_role()='worker' AND worker_id=auth.uid()));
ALTER TABLE public.project_boq_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_boq_lines,public.project_boq_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_boq_lines,public.project_boq_revisions TO authenticated;
DROP POLICY IF EXISTS boq_lines_read ON public.project_boq_lines;
CREATE POLICY boq_lines_read ON public.project_boq_lines FOR SELECT TO authenticated
 USING(public.cf_current_role() IN ('super_admin','pm','client') AND public.cf_project_access(project_id));
DROP POLICY IF EXISTS boq_revision_read ON public.project_boq_revisions;
CREATE POLICY boq_revision_read ON public.project_boq_revisions FOR SELECT TO authenticated
 USING(public.cf_can_manage_project(project_id));
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.project_expenses ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.client_payment_schedule ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.variation_orders ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS boq_stage text;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS allocated_budget numeric NOT NULL DEFAULT 0;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS rate_source text;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS boq_item_id uuid;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS boq_revision integer;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['materials','material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders','salary_slips'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=t||'_boq_project_fk') THEN
 EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(project_id,boq_item_id) REFERENCES public.project_boq_lines(project_id,id)',t,t||'_boq_project_fk');
 END IF;
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(project_id,boq_item_id)',t||'_boq_lookup',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.cf_sync_boq(p_project_id uuid,p_boq jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_data jsonb; group_name text; kind_value text; line_id uuid; label text; qty numeric; price numeric; total numeric; cursor_date date; due date;
BEGIN
 -- Internal-only; callers lock and authorize the project before entering.
 UPDATE public.project_boq_lines SET active=false WHERE project_id=p_project_id;
 FOREACH group_name IN ARRAY ARRAY['items','materials','labour_rates'] LOOP
 kind_value:=CASE group_name WHEN 'items' THEN 'work' WHEN 'materials' THEN 'material' ELSE 'labour' END;
 FOR row_data IN SELECT value FROM jsonb_array_elements(coalesce(p_boq->group_name,'[]'::jsonb)) LOOP
 label:=coalesce(row_data->>'description',row_data->>'name',row_data->>'trade',row_data->>'role');
 line_id:=coalesce(nullif(row_data->>'id','')::uuid,md5(group_name||'|'||coalesce(row_data->>'activity_id',label)||'|'||coalesce(row_data->>'unit',''))::uuid);
 qty:=coalesce((row_data->>'allocated_quantity')::numeric,(row_data->>'quantity')::numeric,0);
 price:=coalesce((row_data->>'daily_rate')::numeric,(row_data->>'unit_price')::numeric,(row_data->>'rate')::numeric,0);
 total:=CASE WHEN kind_value='work' THEN coalesce((row_data->>'amount')::numeric,qty*price) ELSE qty*price END;
 IF EXISTS(SELECT 1 FROM public.project_boq_lines WHERE project_id=p_project_id AND id=line_id AND kind<>kind_value) THEN RAISE EXCEPTION 'A BOQ item cannot change its item type'; END IF;
 IF nullif(trim(label),'') IS NULL OR qty<0 OR price<0 OR total<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') OR total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ line'; END IF;
 INSERT INTO public.project_boq_lines(project_id,id,kind,description,stage,unit,quantity,rate,amount,active)
 VALUES(p_project_id,line_id,kind_value,label,row_data->>'stage',row_data->>'unit',qty,price,total,true)
 ON CONFLICT(project_id,id) DO UPDATE SET description=excluded.description,stage=excluded.stage,unit=excluded.unit,
 quantity=excluded.quantity,rate=excluded.rate,amount=excluded.amount,active=true;
 END LOOP;
 END LOOP;
 -- Update planning fields only. Never change on-hand stock or its received-cost valuation.
 IF EXISTS(SELECT 1 FROM public.materials m JOIN public.project_boq_lines b ON b.project_id=m.project_id AND b.id=m.boq_item_id
 WHERE m.project_id=p_project_id AND lower(trim(m.unit)) IS DISTINCT FROM lower(trim(b.unit)) AND
 (coalesce(m.current_stock,0)<>0 OR EXISTS(SELECT 1 FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id))) THEN RAISE EXCEPTION 'A material with stock or orders cannot change units; add a separate BOQ material'; END IF;
 UPDATE public.materials m SET boq_item_id=b.id,quantity=b.quantity::text,name=b.description,unit=b.unit
 FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.active AND b.kind='material'
 AND m.project_id=b.project_id AND (m.boq_item_id=b.id OR (m.boq_item_id IS NULL AND lower(trim(m.name))=lower(trim(b.description)) AND lower(trim(m.unit))=lower(trim(b.unit))));
 INSERT INTO public.materials(id,project_id,name,unit,current_stock,minimum_threshold,quantity,unit_price,category,status,boq_item_id)
 SELECT gen_random_uuid(),p_project_id,b.description,b.unit,0,greatest(10,round(b.quantity*0.1)),b.quantity::text,0,'General','Pending Order',b.id
 FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.active AND b.kind='material'
 AND NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND boq_item_id=b.id);
 SELECT coalesce(start_date,current_date) INTO cursor_date FROM public.projects WHERE id=p_project_id;
 FOR row_data IN SELECT value FROM jsonb_array_elements(coalesce(p_boq->'milestones','[]'::jsonb)) LOOP
 label:=coalesce(row_data->>'boq_stage',row_data->>'title');
 IF NOT (p_boq->'stage_budgets' ? label) THEN CONTINUE; END IF;
 SELECT due_date INTO due FROM public.milestones WHERE project_id=p_project_id AND (boq_stage=label OR title=label) LIMIT 1;
 IF NOT FOUND THEN
 due:=coalesce(nullif(row_data->>'due_date','')::date,cursor_date+greatest(1,coalesce((row_data->>'duration_days')::integer,21)));
 INSERT INTO public.milestones(id,project_id,title,description,due_date,planned_date,status,completion_percentage,boq_stage,allocated_budget)
 VALUES(gen_random_uuid(),p_project_id,row_data->>'title',coalesce(row_data->>'description',''),due,due,'Pending',0,label,(p_boq->'stage_budgets'->>label)::numeric);
 END IF;
 cursor_date:=greatest(due,cursor_date);
 END LOOP;
 UPDATE public.milestones m SET allocated_budget=coalesce((p_boq->'stage_budgets'->>m.boq_stage)::numeric,0)
 WHERE m.project_id=p_project_id AND m.boq_stage IS NOT NULL;
 UPDATE public.milestones m SET boq_stage=coalesce(m.boq_stage,m.title),allocated_budget=(p_boq->'stage_budgets'->>coalesce(m.boq_stage,m.title))::numeric
 WHERE m.project_id=p_project_id AND p_boq->'stage_budgets' ? coalesce(m.boq_stage,m.title);
 UPDATE public.projects SET completion_percentage=(SELECT coalesce(round(sum(completion_percentage*allocated_budget)/nullif(sum(allocated_budget),0)),0)
 FROM public.milestones WHERE project_id=p_project_id AND boq_stage IS NOT NULL) WHERE id=p_project_id
 AND EXISTS(SELECT 1 FROM public.milestones WHERE project_id=p_project_id AND allocated_budget>0);
END $$;
REVOKE ALL ON FUNCTION public.cf_sync_boq(uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Preserve the existing atomic project/assignment/payload implementation.
DO $$ BEGIN
 IF to_regprocedure('public.cf_save_project_payload_before_boq(uuid,jsonb)') IS NULL THEN
 ALTER FUNCTION public.cf_save_project_payload(uuid,jsonb) RENAME TO cf_save_project_payload_before_boq;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.cf_save_project_payload(p_project_id uuid,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE boq jsonb:=p_data->'boq_data'; rev integer; override_row jsonb; previous public.projects%ROWTYPE; baseline numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 IF jsonb_array_length(coalesce(boq->'items','[]'::jsonb))>20000 OR jsonb_array_length(coalesce(boq->'materials','[]'::jsonb))>1000 OR jsonb_array_length(coalesce(boq->'labour_rates','[]'::jsonb))>1000 THEN RAISE EXCEPTION 'BOQ exceeds the supported item limit'; END IF;
 IF coalesce((boq->>'items_count')::integer,0)>jsonb_array_length(coalesce(boq->'items','[]'::jsonb)) THEN RAISE EXCEPTION 'Upload the original complete BOQ; the stored data contains only a preview'; END IF;
 IF previous.boq_revision>0 AND ((p_data->>'boq_expected_revision')::integer IS DISTINCT FROM previous.boq_revision OR length(trim(coalesce(boq->>'revision_reason','')))<5) THEN RAISE EXCEPTION 'Use an audited BOQ revision with the current revision number'; END IF;
 baseline:=(boq->>'total_budget')::numeric;
 IF baseline IS NULL OR baseline<=0 OR baseline::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ total'; END IF;
 IF jsonb_array_length(coalesce(boq->'items','[]'::jsonb))>0 AND abs(baseline-(SELECT coalesce(sum((value->>'amount')::numeric),0) FROM jsonb_array_elements(boq->'items')))>0.01 THEN RAISE EXCEPTION 'BOQ total must equal its line amounts'; END IF;
 END IF;
 -- The legacy inserter must not create a second stock row when an existing BOQ
 -- material is renamed. Its stable link owns the existing stock identity.
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 p_data:=jsonb_set(p_data,'{boq_data,materials}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(coalesce(boq->'materials','[]'::jsonb))
 WHERE NOT EXISTS(SELECT 1 FROM public.materials WHERE project_id=p_project_id AND boq_item_id=nullif(value->>'id','')::uuid)),'[]'::jsonb));
 END IF;
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN p_data:=jsonb_set(p_data,'{boq_data}',(p_data->'boq_data')-'labour_overrides'); END IF;
 PERFORM public.cf_save_project_payload_before_boq(p_project_id,p_data);
 IF boq IS NOT NULL AND boq<>'null'::jsonb THEN
 FOR override_row IN SELECT value FROM jsonb_array_elements(coalesce(p_data->'milestones','[]'::jsonb)) LOOP
 IF boq->'stage_budgets' ? (override_row->>'boq_stage') THEN
 UPDATE public.milestones SET boq_stage=override_row->>'boq_stage' WHERE project_id=p_project_id AND title=override_row->>'title';
 END IF;
 END LOOP;
 UPDATE public.projects SET boq_data=boq-'labour_overrides' WHERE id=p_project_id;
 DELETE FROM public.project_boq_worker_rates WHERE project_id=p_project_id;
 FOR override_row IN SELECT value FROM jsonb_array_elements(coalesce(boq->'labour_overrides','[]'::jsonb)) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(override_row->>'worker_id')::uuid AND role='worker' AND is_approved IS TRUE) THEN RAISE EXCEPTION 'Choose an approved worker for project pay rates'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_role_assignments WHERE project_id=p_project_id AND user_id=(override_row->>'worker_id')::uuid AND role='worker')
 AND NOT EXISTS(SELECT 1 FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE sw.project_id=p_project_id AND coalesce(w.user_id,sw.worker_id)=(override_row->>'worker_id')::uuid) THEN RAISE EXCEPTION 'Worker rate override requires an assigned worker'; END IF;
 INSERT INTO public.project_boq_worker_rates(project_id,worker_id,daily_rate) VALUES(p_project_id,(override_row->>'worker_id')::uuid,(override_row->>'daily_rate')::numeric);
 END LOOP;
 PERFORM public.cf_sync_boq(p_project_id,boq);
 UPDATE public.projects SET boq_revision=boq_revision+1,total_budget=CASE WHEN p_data ? 'total_budget' THEN total_budget
 ELSE greatest(0,coalesce(total_budget,0)+baseline-coalesce((previous.boq_data->>'total_budget')::numeric,
 coalesce(previous.total_budget,0)-coalesce((SELECT sum(amount) FROM public.variation_orders WHERE project_id=p_project_id AND status='Approved'),0))) END
 WHERE id=p_project_id RETURNING boq_revision INTO rev;
 INSERT INTO public.project_boq_revisions(project_id,revision,boq_data,reason,changed_by)
 VALUES(p_project_id,rev,boq,coalesce(nullif(boq->>'revision_reason',''),'Project BOQ baseline'),auth.uid());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.cf_save_project_payload(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cf_save_project_payload_before_boq(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.revise_project_boq(p_project_id uuid,p_boq jsonb,p_expected_revision integer,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; new_baseline numeric; rev integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF p_expected_revision IS NULL OR project.boq_revision<>p_expected_revision THEN RAISE EXCEPTION 'BOQ changed. Reload before saving your revision'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Explain the BOQ revision'; END IF;
 new_baseline:=(p_boq->>'total_budget')::numeric;
 IF new_baseline IS NULL OR new_baseline<=0 OR new_baseline::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid BOQ total'; END IF;
 IF jsonb_array_length(coalesce(p_boq->'items','[]'::jsonb))>0 AND abs(new_baseline-(SELECT coalesce(sum((value->>'amount')::numeric),0) FROM jsonb_array_elements(p_boq->'items')))>0.01 THEN RAISE EXCEPTION 'BOQ total must equal its line amounts'; END IF;
 PERFORM public.cf_save_project_payload(p_project_id,jsonb_build_object('boq_expected_revision',p_expected_revision,'boq_data',p_boq||jsonb_build_object('revision_reason',p_reason)));
 -- Preserve approved variations and explicit project budget adjustments as a delta.
 SELECT boq_revision INTO rev FROM public.projects WHERE id=p_project_id;
 PERFORM public.refresh_project_spend(p_project_id);
 RETURN jsonb_build_object('ok',true,'revision',rev,'boq_data',p_boq);
END $$;
REVOKE ALL ON FUNCTION public.revise_project_boq(uuid,jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revise_project_boq(uuid,jsonb,integer,text) TO authenticated;

-- Old upload entry point cannot silently replace an already-established baseline.
CREATE OR REPLACE FUNCTION public.apply_project_boq(p_project_id uuid,p_boq jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rev integer;
BEGIN
 SELECT boq_revision INTO rev FROM public.projects WHERE id=p_project_id;
 IF coalesce(rev,0)>0 THEN RAISE EXCEPTION 'Use the BOQ workspace to review and save an audited revision'; END IF;
 RETURN public.revise_project_boq(p_project_id,p_boq,coalesce(rev,0),'Initial BOQ upload');
END $$;

CREATE OR REPLACE FUNCTION public.cf_guard_boq_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line public.project_boq_lines%ROWTYPE; found_id uuid; candidates integer; committed numeric; old_link uuid; stock_id uuid; actual_unit text;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN old_link:=OLD.boq_item_id; END IF;
 IF NEW.boq_item_id IS NULL AND TG_TABLE_NAME IN ('purchase_orders','project_expenses') THEN
 SELECT boq_item_id INTO found_id FROM public.materials WHERE id=nullif(to_jsonb(NEW)->>'material_id','')::uuid AND project_id=NEW.project_id;
 IF found_id IS NULL AND TG_TABLE_NAME='purchase_orders' THEN
 SELECT boq_item_id INTO found_id FROM public.material_requests WHERE id=nullif(to_jsonb(NEW)->>'request_id','')::uuid AND project_id=NEW.project_id;
 END IF;
 NEW.boq_item_id:=found_id;
 END IF;
 IF NEW.boq_item_id IS NULL AND TG_TABLE_NAME='material_requests' THEN
 SELECT count(*),(array_agg(id))[1] INTO candidates,found_id FROM public.project_boq_lines WHERE project_id=NEW.project_id AND active AND kind='material'
 AND lower(trim(description))=lower(trim(NEW.item_name)) AND lower(trim(unit))=lower(trim(NEW.unit));
 IF candidates=1 THEN NEW.boq_item_id:=found_id; END IF;
 END IF;
 IF NEW.boq_item_id IS NULL THEN
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND boq_revision>0) THEN
 RAISE EXCEPTION 'Choose a BOQ reference. Add an editable BOQ item first for work outside the current plan'; END IF;
 RETURN NEW; -- Existing unallocated records remain visible for explicit reconciliation.
 END IF;
 SELECT * INTO line FROM public.project_boq_lines WHERE project_id=NEW.project_id AND id=NEW.boq_item_id;
 IF NOT FOUND OR (NOT line.active AND (TG_OP='INSERT' OR old_link IS DISTINCT FROM NEW.boq_item_id)) THEN RAISE EXCEPTION 'Choose an active BOQ item from this project'; END IF;
 IF TG_TABLE_NAME IN ('material_requests','purchase_orders') AND line.kind<>'material' THEN RAISE EXCEPTION 'Choose a BOQ material baseline for procurement'; END IF;
 IF TG_TABLE_NAME IN ('client_payment_schedule','variation_orders') AND line.kind<>'work' THEN RAISE EXCEPTION 'Choose a BOQ work item for payments or variations'; END IF;
 IF TG_TABLE_NAME='purchase_orders' AND line.kind='material' AND to_jsonb(NEW)->>'status' NOT IN ('Cancelled','Rejected') THEN
 SELECT unit INTO actual_unit FROM public.materials WHERE id=NEW.material_id::uuid AND project_id=NEW.project_id;
 IF actual_unit IS NULL THEN SELECT unit INTO actual_unit FROM public.material_catalog WHERE id=NEW.material_id::uuid; END IF;
 IF actual_unit IS NULL OR lower(trim(actual_unit))<>lower(trim(line.unit)) THEN RAISE EXCEPTION 'Order material unit must match its BOQ baseline'; END IF;
 IF TG_OP='INSERT' THEN
 SELECT id INTO stock_id FROM public.materials WHERE project_id=NEW.project_id AND boq_item_id=line.id;
 IF stock_id IS NOT NULL THEN NEW.material_id:=stock_id; END IF;
 END IF;
 IF lower(trim(coalesce(to_jsonb(NEW)->>'unit',line.unit)))<>lower(trim(line.unit)) THEN RAISE EXCEPTION 'Order unit must match its BOQ material'; END IF;
 SELECT coalesce(sum(quantity_ordered),0) INTO committed FROM public.purchase_orders
 WHERE project_id=NEW.project_id AND boq_item_id=line.id AND id<>NEW.id AND status NOT IN ('Cancelled','Rejected');
 IF committed+NEW.quantity_ordered>line.quantity AND (TG_OP='INSERT' OR NEW.quantity_ordered IS DISTINCT FROM OLD.quantity_ordered OR old_link IS DISTINCT FROM NEW.boq_item_id) THEN
 RAISE EXCEPTION 'Order exceeds BOQ planned quantity. Revise the BOQ before ordering additional material'; END IF;
 END IF;
 IF TG_TABLE_NAME='client_payment_schedule' THEN
 SELECT coalesce(sum(amount),0) INTO committed FROM public.client_payment_schedule
 WHERE project_id=NEW.project_id AND boq_item_id=line.id AND id<>NEW.id AND status NOT IN ('Cancelled','Rejected');
 IF committed+NEW.amount>line.amount+coalesce((SELECT sum(amount) FROM public.variation_orders WHERE project_id=NEW.project_id AND boq_item_id=line.id AND status='Approved'),0)
 AND (TG_OP='INSERT' OR NEW.amount IS DISTINCT FROM OLD.amount OR old_link IS DISTINCT FROM NEW.boq_item_id) THEN
 RAISE EXCEPTION 'Scheduled payments exceed this BOQ item and its approved variations'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS zz_boq_link ON public.%I',t);
 EXECUTE format('CREATE TRIGGER zz_boq_link BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cf_guard_boq_link()',t);
 END LOOP;
END $$;

-- Existing RPCs accept their original JSON payloads plus an explicit BOQ reference.
DO $$ BEGIN
 IF to_regprocedure('public.record_project_expense_before_boq(uuid,jsonb)') IS NULL THEN
 ALTER FUNCTION public.record_project_expense(uuid,jsonb) RENAME TO record_project_expense_before_boq; END IF;
 IF to_regprocedure('public.create_project_commercial_record_before_boq(uuid,text,jsonb)') IS NULL THEN
 ALTER FUNCTION public.create_project_commercial_record(uuid,text,jsonb) RENAME TO create_project_commercial_record_before_boq; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.record_project_expense(p_project_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; stock public.materials%ROWTYPE; qty numeric:=coalesce((p_data->>'quantity_used')::numeric,0); value_amount numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF value_amount IS NULL OR value_amount<0 OR qty<0 OR value_amount::text IN ('NaN','Infinity','-Infinity') OR qty::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Invalid expense'; END IF;
 IF nullif(p_data->>'purchase_order_id','') IS NOT NULL THEN RAISE EXCEPTION 'PO costs are already included in project financials'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF qty>0 THEN
 SELECT * INTO stock FROM public.materials WHERE id=(p_data->>'material_id')::uuid AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND OR coalesce(stock.current_stock,0)<qty THEN RAISE EXCEPTION 'Insufficient project stock'; END IF;
 UPDATE public.materials SET current_stock=current_stock-qty WHERE id=stock.id;
 value_amount:=0; -- Received goods are already costed; usage is a stock movement.
 END IF;
 INSERT INTO public.project_expenses(project_id,title,description,amount,expense_date,category,material_id,quantity_used,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'title'),p_data->>'description',value_amount,coalesce((p_data->>'expense_date')::date,current_date),p_data->>'category',nullif(p_data->>'material_id','')::uuid,qty,nullif(p_data->>'boq_item_id','')::uuid)
 RETURNING to_jsonb(project_expenses.*) INTO saved;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION public.create_project_commercial_record(p_project_id uuid,p_kind text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; amount_value numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF amount_value IS NULL OR amount_value<=0 OR amount_value::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'description'),'') IS NULL THEN RAISE EXCEPTION 'A description and positive amount are required'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p_kind='payment' THEN
 IF p_data->>'due_date' IS NULL THEN RAISE EXCEPTION 'Payment due date required'; END IF;
 INSERT INTO public.client_payment_schedule(project_id,description,amount,due_date,status,created_by,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'description'),amount_value,(p_data->>'due_date')::date,'Pending',auth.uid(),nullif(p_data->>'boq_item_id','')::uuid) RETURNING to_jsonb(client_payment_schedule.*) INTO saved;
 ELSIF p_kind='variation' THEN
 IF nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Variation title required'; END IF;
 INSERT INTO public.variation_orders(project_id,title,description,amount,status,created_by,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'title'),trim(p_data->>'description'),amount_value,'Pending',auth.uid(),nullif(p_data->>'boq_item_id','')::uuid) RETURNING to_jsonb(variation_orders.*) INTO saved;
 ELSE RAISE EXCEPTION 'Invalid commercial record kind';
 END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.record_project_expense_before_boq(uuid,jsonb),public.create_project_commercial_record_before_boq(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_project_expense(uuid,jsonb),public.create_project_commercial_record(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_project_expense(uuid,jsonb),public.create_project_commercial_record(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_boq(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; result jsonb; role_value text:=public.cf_current_role();
BEGIN
 IF auth.uid() IS NULL OR coalesce(role_value,'') NOT IN ('super_admin','pm','client','site_manager') OR NOT coalesce(public.cf_project_access(p_project_id),false) THEN RAISE EXCEPTION 'Project BOQ access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF role_value='site_manager' THEN
 RETURN jsonb_build_object('revision',project.boq_revision,'project_name',project.name,'materials',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.description,'unit',b.unit,'allocated_quantity',b.quantity,'active',b.active,
 'ordered_quantity',(SELECT coalesce(sum(quantity_ordered),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status NOT IN ('Cancelled','Rejected')),
 'received_quantity',(SELECT coalesce(sum(quantity_received),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id)
 )),'[]'::jsonb) FROM public.project_boq_lines b WHERE b.project_id=p_project_id AND b.kind='material' AND b.active));
 END IF;
 SELECT jsonb_build_object('project_name',project.name,'revision',project.boq_revision,'boq_data',project.boq_data,'project_budget',project.total_budget,
 'requires_reupload',CASE WHEN jsonb_typeof(project.boq_data->'items_count')='number' THEN (project.boq_data->>'items_count')::numeric>jsonb_array_length(coalesce(project.boq_data->'items','[]'::jsonb)) ELSE false END,
 'lines',coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'ordered_quantity',(SELECT coalesce(sum(quantity_ordered),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status NOT IN ('Cancelled','Rejected')),
 'received_quantity',(SELECT coalesce(sum(quantity_received),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id),
 'used_quantity',(SELECT coalesce(sum(quantity_used),0) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id=b.id),
 'actual_cost',(SELECT coalesce(sum(CASE WHEN status='Received' THEN total_price WHEN status='Delivered' AND quantity_ordered>0 THEN total_price*least(1,quantity_received/quantity_ordered) ELSE 0 END),0) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id=b.id)
 +(SELECT coalesce(sum(amount),0) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id=b.id)
 +(SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) FROM public.salary_slips WHERE project_id=p_project_id AND boq_item_id=b.id AND status='Paid'),
 'payment_scheduled',(SELECT coalesce(sum(amount),0) FROM public.client_payment_schedule WHERE project_id=p_project_id AND boq_item_id=b.id),
 'approved_variations',(SELECT coalesce(sum(amount),0) FROM public.variation_orders WHERE project_id=p_project_id AND boq_item_id=b.id AND status='Approved')
 )) FROM public.project_boq_lines b WHERE b.project_id=p_project_id),'[]'::jsonb),
 'unallocated_orders',(SELECT count(*) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'unallocated_expenses',(SELECT count(*) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'payroll_paid',(SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) FROM public.salary_slips WHERE project_id=p_project_id AND status='Paid')
 ) INTO result;
 IF role_value='client' THEN
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)-'labour_overrides'-'labour_rates');
 result:=jsonb_set(result,'{lines}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(result->'lines') WHERE value->>'kind'<>'labour'),'[]'::jsonb));
 END IF;
 IF role_value IN ('super_admin','pm') THEN
 result:=result||jsonb_build_object('unallocated_records',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT 'purchase_orders' AS table_name,id,coalesce(po_number,'Purchase order') AS label FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'project_expenses',id,title FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'material_requests',id,item_name FROM public.material_requests WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'client_payment_schedule',id,description FROM public.client_payment_schedule WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'variation_orders',id,title FROM public.variation_orders WHERE project_id=p_project_id AND boq_item_id IS NULL LIMIT 200
 ) r),'[]'::jsonb));
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)||jsonb_build_object('labour_overrides',coalesce((SELECT jsonb_agg(jsonb_build_object('worker_id',worker_id,'daily_rate',daily_rate)) FROM public.project_boq_worker_rates WHERE project_id=p_project_id),'[]'::jsonb)));
 result:=result||jsonb_build_object('workers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name)) FROM public.profiles p WHERE p.role='worker' AND EXISTS(SELECT 1 FROM public.project_role_assignments a WHERE a.project_id=p_project_id AND a.user_id=p.id AND a.role='worker')),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT project_id,revision,reason,changed_by,changed_at FROM public.project_boq_revisions WHERE project_id=p_project_id ORDER BY revision DESC LIMIT 10) r),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_project_boq(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_project_boq(uuid) TO authenticated;

-- A direct Data API update must not bypass revision history or reset the counter.
CREATE OR REPLACE FUNCTION public.cf_protect_boq_baseline() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
 IF TG_OP='INSERT' THEN
 IF NEW.boq_data IS NOT NULL OR NEW.boq_revision<>0 THEN RAISE EXCEPTION 'Save BOQ through the project workflow'; END IF;
 ELSIF NEW.boq_data IS DISTINCT FROM OLD.boq_data OR NEW.boq_revision IS DISTINCT FROM OLD.boq_revision THEN
 RAISE EXCEPTION 'Use an audited BOQ revision'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cf_protect_boq_baseline ON public.projects;
CREATE TRIGGER cf_protect_boq_baseline BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.cf_protect_boq_baseline();

CREATE OR REPLACE FUNCTION public.allocate_boq_record(p_project_id uuid,p_table text,p_record_id uuid,p_boq_item_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(public.cf_current_role(),'') NOT IN ('super_admin','pm') OR NOT coalesce(public.cf_can_manage_project(p_project_id),false) THEN RAISE EXCEPTION 'Project management access required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN ('material_requests','purchase_orders','project_expenses','client_payment_schedule','variation_orders') THEN RAISE EXCEPTION 'Invalid record type'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.project_boq_lines WHERE project_id=p_project_id AND id=p_boq_item_id AND active) THEN RAISE EXCEPTION 'Choose an active BOQ item from this project'; END IF;
 EXECUTE format('UPDATE public.%I SET boq_item_id=$1 WHERE id=$2 AND project_id=$3',p_table) USING p_boq_item_id,p_record_id,p_project_id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Project record not found' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.allocate_boq_record(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.allocate_boq_record(uuid,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_project_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END; weighted numeric;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=project FOR UPDATE;
 SELECT round(sum(completion_percentage*allocated_budget)/nullif(sum(allocated_budget),0)) INTO weighted
 FROM public.milestones WHERE project_id=project AND boq_stage IS NOT NULL;
 UPDATE public.projects SET completion_percentage=coalesce(weighted,(SELECT round(avg(coalesce(completion_percentage,CASE WHEN status='Completed' THEN 100 ELSE 0 END))) FROM public.milestones WHERE project_id=project),0)
 WHERE id=project;
 RETURN NULL;
END $$;
NOTIFY pgrst, 'reload schema';


NOTIFY pgrst, 'reload schema';
COMMIT;
