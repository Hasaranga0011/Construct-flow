-- Apply after the existing project-role-assignment and purchase-order schemas.
-- Run this file as a database owner in one transaction. No application secrets.
BEGIN;

CREATE OR REPLACE FUNCTION public.cf_current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE lower(replace(role, ' ', '_'))
    WHEN 'admin' THEN 'super_admin' WHEN 'superadmin' THEN 'super_admin'
    WHEN 'manager' THEN 'pm' WHEN 'project_manager' THEN 'pm'
    ELSE lower(replace(role, ' ', '_')) END
  FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.cf_current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_current_role() TO authenticated;

-- Ignore user-editable roles when the Auth service creates a profile.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, 'client');
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Public signup metadata and self-service profile edits cannot grant privileges.
CREATE OR REPLACE FUNCTION public.cf_guard_profile_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.role() IS NULL OR public.cf_current_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.role := 'client';
  ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only an administrator can change account roles' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.cf_guard_profile_role() FROM PUBLIC;
DROP TRIGGER IF EXISTS cf_profile_role_guard ON public.profiles;
CREATE TRIGGER cf_profile_role_guard BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.cf_guard_profile_role();

CREATE OR REPLACE FUNCTION public.cf_can_manage_project(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND coalesce((
    public.cf_current_role() = 'super_admin' OR
    (public.cf_current_role() = 'pm' AND EXISTS (
      SELECT 1 FROM public.projects WHERE id = p_id AND pm_id = auth.uid()
    ))
  ), false)
$$;
REVOKE ALL ON FUNCTION public.cf_can_manage_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_can_manage_project(uuid) TO authenticated;

ALTER TABLE public.project_role_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_role_assignments_access ON public.project_role_assignments;
DROP POLICY IF EXISTS "Allow project role assignments" ON public.project_role_assignments;
DROP POLICY IF EXISTS cf_assignments_read ON public.project_role_assignments;
DROP POLICY IF EXISTS cf_assignments_write ON public.project_role_assignments;
DROP POLICY IF EXISTS cf_assignments_boundary ON public.project_role_assignments;
CREATE POLICY cf_assignments_read ON public.project_role_assignments
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.cf_can_manage_project(project_id));
CREATE POLICY cf_assignments_write ON public.project_role_assignments
FOR ALL TO authenticated
USING (public.cf_current_role() = 'super_admin')
WITH CHECK (public.cf_current_role() = 'super_admin');
-- Restrictive policies also constrain any older permissive policies.
CREATE POLICY cf_assignments_boundary ON public.project_role_assignments AS RESTRICTIVE
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.cf_can_manage_project(project_id))
WITH CHECK (public.cf_current_role() = 'super_admin');
REVOKE ALL ON public.project_role_assignments FROM anon;

-- Atomic project + canonical assignment persistence. Omitted lists stay unchanged;
-- an explicit [] clears that role. Invalid users/roles roll back the whole save.
CREATE OR REPLACE FUNCTION public.save_project_with_assignments(p_project_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_role text := public.cf_current_role();
  v_columns text;
  v_changes jsonb;
  v_key text;
  v_assignment_role text;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'pm') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    IF v_role = 'pm' THEN
      IF p_data->>'pm_id' IS NOT NULL AND (p_data->>'pm_id')::uuid <> auth.uid() THEN
        RAISE EXCEPTION 'Cannot create a project for another PM' USING ERRCODE = '42501';
      END IF;
      p_data := p_data || jsonb_build_object('pm_id', auth.uid());
    END IF;
  ELSE
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
    IF NOT public.cf_can_manage_project(p_project_id) THEN
      RAISE EXCEPTION 'Not your project' USING ERRCODE = '42501';
    END IF;
    IF v_role <> 'super_admin' AND p_data ? 'pm_id'
       AND (p_data->>'pm_id')::uuid IS DISTINCT FROM v_project.pm_id THEN
      RAISE EXCEPTION 'Only admins can reassign a PM' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_role <> 'super_admin' AND p_data ? 'admins' AND p_data->'admins' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Only admins can assign admins' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_object_agg(key, value), string_agg(format('%I', key), ', ' ORDER BY key)
    INTO v_changes, v_columns FROM jsonb_each(p_data)
    WHERE key = ANY(ARRAY['name','location','status','completion_percentage','spent_cost',
      'total_budget','start_date','end_date','client_id','pm_id','latitude','longitude','address']);
  IF p_project_id IS NULL THEN
    IF v_columns IS NULL THEN RAISE EXCEPTION 'Project fields required'; END IF;
    EXECUTE format('INSERT INTO public.projects (%s) SELECT %s FROM jsonb_populate_record(NULL::public.projects, $1) RETURNING *', v_columns, v_columns)
      INTO v_project USING v_changes;
    p_project_id := v_project.id;
  ELSIF v_columns IS NOT NULL THEN
    EXECUTE format('UPDATE public.projects SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.projects, $1)) WHERE id = $2 RETURNING *', v_columns, v_columns)
      INTO v_project USING v_changes, p_project_id;
  END IF;
  IF v_project.end_date < v_project.start_date THEN RAISE EXCEPTION 'End date precedes start date'; END IF;
  IF v_project.total_budget < 0 THEN RAISE EXCEPTION 'Budget must be nonnegative'; END IF;

  DELETE FROM public.project_role_assignments WHERE project_id = p_project_id AND role IN ('pm','client');
  IF v_project.pm_id IS NOT NULL THEN
    INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(p_project_id,v_project.pm_id,'pm');
  END IF;
  IF v_project.client_id IS NOT NULL THEN
    INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(p_project_id,v_project.client_id,'client');
  END IF;
  FOR v_key, v_assignment_role IN SELECT * FROM (VALUES
    ('site_managers','site_manager'),('workers','worker'),('suppliers','supplier'),('admins','admin')) AS roles(key,role)
  LOOP
    IF p_data ? v_key AND p_data->v_key <> 'null'::jsonb THEN
      IF v_key = 'admins' AND v_role <> 'super_admin' THEN CONTINUE; END IF;
      DELETE FROM public.project_role_assignments WHERE project_id=p_project_id AND role=v_assignment_role;
      INSERT INTO public.project_role_assignments(project_id,user_id,role)
        SELECT p_project_id, value::uuid, v_assignment_role FROM jsonb_array_elements_text(p_data->v_key)
        ON CONFLICT (project_id,user_id,role) DO NOTHING;
    END IF;
  END LOOP;
  DELETE FROM public.pm_projects WHERE project_id=p_project_id;
  IF v_project.pm_id IS NOT NULL THEN
    INSERT INTO public.pm_projects(project_id,pm_id) VALUES(p_project_id,v_project.pm_id);
  END IF;
  RETURN to_jsonb(v_project);
END
$$;
REVOKE ALL ON FUNCTION public.save_project_with_assignments(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_project_with_assignments(uuid,jsonb) TO authenticated;

-- Lock the order so retries cannot count a delivery twice; increment stock in SQL
-- to avoid losing concurrent deliveries of the same material.
CREATE OR REPLACE FUNCTION public.deliver_purchase_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.purchase_orders%ROWTYPE; v_role text := public.cf_current_role();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF NOT (coalesce(v_role='super_admin',false)
     OR coalesce(v_role='supplier' AND v_order.supplier_id=auth.uid(),false)
     OR public.cf_can_manage_project(v_order.project_id)) THEN
    RAISE EXCEPTION 'Not your order' USING ERRCODE='42501';
  END IF;
  IF v_order.status='Delivered' THEN RETURN to_jsonb(v_order); END IF;
  IF v_order.status NOT IN ('Confirmed','Pending Delivery') THEN
    RAISE EXCEPTION 'Order is not ready for delivery';
  END IF;
  IF v_order.quantity_ordered IS NULL OR v_order.quantity_ordered <= 0 OR v_order.material_id IS NULL THEN
    RAISE EXCEPTION 'Order has invalid material or quantity';
  END IF;
  UPDATE public.materials SET global_stock_quantity=coalesce(global_stock_quantity,0)+v_order.quantity_ordered
    WHERE id=v_order.material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  UPDATE public.purchase_orders SET status='Delivered' WHERE id=p_order_id RETURNING * INTO v_order;
  INSERT INTO public.notifications(project_id,target_role,title,message,type) VALUES
    (v_order.project_id,'pm','Materials Delivered','Order '||v_order.po_number||' arrived at site.','success'),
    (v_order.project_id,'site_manager','Materials Delivered','Order '||v_order.po_number||' arrived at site.','success');
  RETURN to_jsonb(v_order);
END
$$;
REVOKE ALL ON FUNCTION public.deliver_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deliver_purchase_order(uuid) TO authenticated;
COMMIT;
