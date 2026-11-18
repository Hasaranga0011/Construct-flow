-- New internal accounts require approval even when created via direct Supabase signup.
BEGIN;
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
COMMIT;
