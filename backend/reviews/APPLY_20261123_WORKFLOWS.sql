-- Apply after the existing BOQ, workflow and audit migrations. No records deleted.
BEGIN;

-- Owner-approved assignment choices from 2026-11-23. Attendance/payroll are untouched.
CREATE TABLE IF NOT EXISTS public.cf_completed_upgrades(upgrade text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.cf_completed_upgrades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cf_completed_upgrades FROM PUBLIC,anon,authenticated,service_role;
LOCK TABLE public.site_workers,public.project_role_assignments IN SHARE ROW EXCLUSIVE MODE;
DO $reconcile$
DECLARE choice jsonb; person uuid; keep uuid; record_id uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.cf_completed_upgrades WHERE upgrade='20261123_worker_assignment_choices') THEN RETURN; END IF;
 FOR choice IN SELECT value FROM jsonb_array_elements($choices$[{"worker_id":"333c8be9-8bc5-4bb8-97d5-203809e03332","worker_name":"john","keep_project":"24a05984-133e-493e-9b75-5da177c36839","keep_name":"Hambantota Villa","observed_projects":["24a05984-133e-493e-9b75-5da177c36839","46d1b283-3a78-41b9-b991-695062497ef5","60bd722f-800c-4aa0-9055-fd5ec35d113c","fb545db0-e296-432b-a40c-34af6fa5bf85"]},{"worker_id":"2642bb85-4de4-44d2-b44d-27b9909f771f","worker_name":"Saman Worker","keep_project":"bed3d167-2690-42c5-be4c-98759fb47515","keep_name":"lotus","observed_projects":["24a05984-133e-493e-9b75-5da177c36839","bed3d167-2690-42c5-be4c-98759fb47515","cd3a9f8d-2c47-4b81-9fb9-81cfdc06104a"]},{"worker_id":"dc002619-38a0-40d9-9530-32a5a8663ff3","worker_name":"Test Worker","keep_project":"fb545db0-e296-432b-a40c-34af6fa5bf85","keep_name":"TEST BOQ 2","observed_projects":["05a965c6-aecf-40b7-801a-33f25d20aae7","bed3d167-2690-42c5-be4c-98759fb47515","fb545db0-e296-432b-a40c-34af6fa5bf85"]},{"worker_id":"ba673210-086e-4d90-9b25-371f8480b841","worker_name":"Kasun Kalhara","keep_project":"cd3a9f8d-2c47-4b81-9fb9-81cfdc06104a","keep_name":"Magampura Resort","observed_projects":["bed3d167-2690-42c5-be4c-98759fb47515","cd3a9f8d-2c47-4b81-9fb9-81cfdc06104a","fb545db0-e296-432b-a40c-34af6fa5bf85"]},{"worker_id":"3307989e-116e-40cd-a20b-d40aea3cd910","worker_name":"Worker1","keep_project":"79770fc8-c1c5-4cf8-9db8-a406d32821bb","keep_name":"Galle House Karapitiya","observed_projects":["79770fc8-c1c5-4cf8-9db8-a406d32821bb","cd3a9f8d-2c47-4b81-9fb9-81cfdc06104a"]},{"worker_id":"5de044a1-b18c-490b-a029-2a7c64de4738","worker_name":"Kamal Worker","keep_project":"dd494b77-0bb4-4903-aa0c-fd0adfa15d0a","keep_name":"KDU","observed_projects":["60bd722f-800c-4aa0-9055-fd5ec35d113c","dd494b77-0bb4-4903-aa0c-fd0adfa15d0a","fb545db0-e296-432b-a40c-34af6fa5bf85"]},{"worker_id":"7d6ba947-8e83-4a6c-a461-40d1e1a686f2","worker_name":"Nimal Worker","keep_project":"60bd722f-800c-4aa0-9055-fd5ec35d113c","keep_name":"Test Project10.03","observed_projects":["60bd722f-800c-4aa0-9055-fd5ec35d113c","fb545db0-e296-432b-a40c-34af6fa5bf85"]},{"worker_id":"570e951d-a9b9-4bf9-b9d8-8bd2bb8637ad","worker_name":"CF UI QA worker","keep_project":"6b896149-ee9f-4b07-b245-1b41afca82b6","keep_name":"CF UI QA - 20261116-163611","observed_projects":["6b896149-ee9f-4b07-b245-1b41afca82b6","b11f273f-63b1-4753-944a-be5091ab9e00"]}]$choices$::jsonb) ORDER BY value->>'worker_id' LOOP
  person:=(choice->>'worker_id')::uuid;keep:=(choice->>'keep_project')::uuid;
  PERFORM 1 FROM public.profiles WHERE id=person AND lower(replace(role,' ','_'))='worker' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved worker no longer exists: %',person; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE coalesce(w.user_id,sw.worker_id)=person AND sw.project_id=keep)
  AND NOT EXISTS(SELECT 1 FROM public.project_role_assignments WHERE user_id=person AND project_id=keep AND lower(replace(role,' ','_'))='worker') THEN RAISE EXCEPTION 'Approved project assignment changed; review worker %',person; END IF;
  IF EXISTS(SELECT 1 FROM (
    SELECT sw.project_id FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE coalesce(w.user_id,sw.worker_id)=person
    UNION SELECT project_id FROM public.project_role_assignments WHERE user_id=person AND lower(replace(role,' ','_'))='worker'
  ) assignments WHERE NOT (choice->'observed_projects' ? assignments.project_id::text)) THEN RAISE EXCEPTION 'New assignment needs review for worker %',person; END IF;
  DELETE FROM public.site_workers sw WHERE sw.project_id<>keep AND (sw.worker_id=person OR sw.worker_id IN(SELECT id FROM public.workers WHERE user_id=person));
  DELETE FROM public.project_role_assignments WHERE user_id=person AND project_id<>keep AND lower(replace(role,' ','_'))='worker';
  SELECT id INTO record_id FROM public.workers WHERE user_id=person ORDER BY id LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE coalesce(w.user_id,sw.worker_id)=person AND sw.project_id=keep) THEN
   INSERT INTO public.site_workers(id,project_id,worker_id) VALUES(gen_random_uuid(),keep,coalesce(record_id,person));
  END IF;
  INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(keep,person,'worker') ON CONFLICT(project_id,user_id,role) DO NOTHING;
  UPDATE public.workers SET site_id=(SELECT id FROM public.sites WHERE project_id=keep ORDER BY id LIMIT 1) WHERE user_id=person;
 END LOOP;
 INSERT INTO public.cf_completed_upgrades(upgrade) VALUES('20261123_worker_assignment_choices');
END $reconcile$;

CREATE TABLE IF NOT EXISTS public.username_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text NOT NULL UNIQUE CHECK(username=lower(username) AND username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
 recovered_by uuid REFERENCES auth.users(id), recovered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.username_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.username_accounts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.username_accounts TO service_role;

ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS deductions numeric NOT NULL DEFAULT 0;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS deduction_details jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS pay_basis text;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS salary_rate numeric;

CREATE TABLE IF NOT EXISTS public.staff_compensation (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 monthly_salary numeric(14,2) NOT NULL CHECK(monthly_salary>0 AND monthly_salary::text NOT IN ('NaN','Infinity','-Infinity')),
 updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_compensation FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.staff_compensation TO authenticated;
DROP POLICY IF EXISTS staff_rate_read ON public.staff_compensation;
CREATE POLICY staff_rate_read ON public.staff_compensation FOR SELECT TO authenticated USING(public.cf_current_role()='super_admin' OR user_id=auth.uid());
DROP POLICY IF EXISTS staff_rate_insert ON public.staff_compensation;
CREATE POLICY staff_rate_insert ON public.staff_compensation FOR INSERT TO authenticated WITH CHECK(public.cf_current_role()='super_admin' AND updated_by=auth.uid());
DROP POLICY IF EXISTS staff_rate_update ON public.staff_compensation;
CREATE POLICY staff_rate_update ON public.staff_compensation FOR UPDATE TO authenticated USING(public.cf_current_role()='super_admin') WITH CHECK(public.cf_current_role()='super_admin' AND updated_by=auth.uid());

CREATE OR REPLACE FUNCTION public.cf_can_record_expense(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.cf_can_manage_project(p_id) OR
  (public.cf_current_role()='site_manager' AND EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=p_id AND site_manager_id=auth.uid())))
$$;
REVOKE ALL ON FUNCTION public.cf_can_record_expense(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cf_can_record_expense(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.expense_boq_references(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.cf_can_record_expense(p_project_id),false) THEN RAISE EXCEPTION 'Assigned project expense access required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'description',description,'unit',unit,'quantity',quantity,'active',active,'kind',kind) ORDER BY description) FROM public.project_boq_lines WHERE project_id=p_project_id AND kind='work' AND active),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.expense_boq_references(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expense_boq_references(uuid) TO authenticated;
DROP POLICY IF EXISTS expense_financial_read_scope ON public.project_expenses;
CREATE POLICY expense_financial_read_scope ON public.project_expenses AS RESTRICTIVE FOR SELECT TO authenticated USING(public.cf_can_record_expense(project_id));
DROP POLICY IF EXISTS expense_operator_read ON public.project_expenses;
CREATE POLICY expense_operator_read ON public.project_expenses FOR SELECT TO authenticated USING(public.cf_can_record_expense(project_id));

CREATE OR REPLACE FUNCTION public.record_project_expense(p_project_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; stock public.materials%ROWTYPE; qty numeric:=coalesce((p_data->>'quantity_used')::numeric,0); value_amount numeric:=(p_data->>'amount')::numeric;
BEGIN
 IF NOT coalesce(public.cf_can_record_expense(p_project_id),false) THEN RAISE EXCEPTION 'Assigned project expense access required' USING ERRCODE='42501'; END IF;
 IF value_amount IS NULL OR value_amount<0 OR qty<0 OR value_amount::text IN ('NaN','Infinity','-Infinity') OR qty::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Invalid expense'; END IF;
 IF nullif(p_data->>'purchase_order_id','') IS NOT NULL THEN RAISE EXCEPTION 'PO costs are already included in project financials'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF qty>0 THEN
  SELECT * INTO stock FROM public.materials WHERE id=(p_data->>'material_id')::uuid AND project_id=p_project_id FOR UPDATE;
  IF NOT FOUND OR coalesce(stock.current_stock,0)<qty THEN RAISE EXCEPTION 'Insufficient project stock'; END IF;
  UPDATE public.materials SET current_stock=current_stock-qty WHERE id=stock.id;
  value_amount:=0;
 END IF;
 INSERT INTO public.project_expenses(project_id,title,description,amount,expense_date,category,material_id,quantity_used,boq_item_id)
 VALUES(p_project_id,trim(p_data->>'title'),p_data->>'description',value_amount,coalesce((p_data->>'expense_date')::date,current_date),p_data->>'category',nullif(p_data->>'material_id','')::uuid,qty,nullif(p_data->>'boq_item_id','')::uuid)
 RETURNING to_jsonb(project_expenses.*) INTO saved;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.record_project_expense(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_project_expense(uuid,jsonb) TO authenticated;

-- Existing cross-project assignments need owner review; never delete them here.
LOCK TABLE public.site_workers,public.project_role_assignments IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM (
  SELECT coalesce(w.user_id,sw.worker_id) AS person,sw.project_id FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id
  UNION SELECT user_id,project_id FROM public.project_role_assignments WHERE lower(replace(role,' ','_'))='worker'
 ) x GROUP BY person HAVING count(DISTINCT project_id)>1) THEN
  RAISE EXCEPTION 'Workers already assigned to multiple projects. Review assignments, retain one project per worker, then rerun this transaction.';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.cf_one_worker_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE person uuid;
BEGIN
 IF TG_TABLE_NAME='project_role_assignments' THEN
  IF lower(replace(NEW.role,' ','_'))<>'worker' THEN RETURN NEW; END IF;
  person:=NEW.user_id;
 ELSE
  SELECT user_id INTO person FROM public.workers WHERE id=NEW.worker_id;
  person:=coalesce(person,NEW.worker_id);
 END IF;
 PERFORM 1 FROM public.profiles WHERE id=person FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Worker profile not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE coalesce(w.user_id,sw.worker_id)=person AND sw.project_id<>NEW.project_id)
 OR EXISTS(SELECT 1 FROM public.project_role_assignments WHERE user_id=person AND lower(replace(role,' ','_'))='worker' AND project_id<>NEW.project_id) THEN
  RAISE EXCEPTION 'Worker is assigned to another project. Remove the previous assignment before assigning a new project.' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS one_worker_project ON public.site_workers;
CREATE TRIGGER one_worker_project BEFORE INSERT OR UPDATE ON public.site_workers FOR EACH ROW EXECUTE FUNCTION public.cf_one_worker_project();
DROP TRIGGER IF EXISTS one_worker_role_project ON public.project_role_assignments;
CREATE TRIGGER one_worker_role_project BEFORE INSERT OR UPDATE ON public.project_role_assignments FOR EACH ROW EXECUTE FUNCTION public.cf_one_worker_project();

CREATE OR REPLACE FUNCTION public.assign_project_worker(p_project_id uuid,p_worker_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE person uuid; record_id uuid; saved jsonb;
BEGIN
 IF NOT coalesce(public.cf_can_record_expense(p_project_id),false) THEN RAISE EXCEPTION 'Assigned project management required' USING ERRCODE='42501'; END IF;
 SELECT user_id,id INTO person,record_id FROM public.workers WHERE id=p_worker_id OR user_id=p_worker_id ORDER BY id LIMIT 1;
 person:=coalesce(person,p_worker_id);
 PERFORM 1 FROM public.profiles WHERE id=person AND lower(replace(role,' ','_'))='worker' AND is_approved IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an approved worker'; END IF;
 SELECT to_jsonb(sw.*) INTO saved FROM public.site_workers sw LEFT JOIN public.workers w ON w.id=sw.worker_id WHERE sw.project_id=p_project_id AND coalesce(w.user_id,sw.worker_id)=person LIMIT 1;
 IF saved IS NULL THEN
  INSERT INTO public.site_workers(id,project_id,worker_id) VALUES(gen_random_uuid(),p_project_id,coalesce(record_id,person)) RETURNING to_jsonb(site_workers.*) INTO saved;
 END IF;
 INSERT INTO public.project_role_assignments(project_id,user_id,role) VALUES(p_project_id,person,'worker') ON CONFLICT(project_id,user_id,role) DO NOTHING;
 IF record_id IS NOT NULL THEN UPDATE public.workers SET site_id=(SELECT id FROM public.sites WHERE project_id=p_project_id ORDER BY id LIMIT 1) WHERE id=record_id; END IF;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION public.remove_project_worker(p_assignment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE assignment public.site_workers%ROWTYPE; person uuid;
BEGIN
 SELECT * INTO assignment FROM public.site_workers WHERE id=p_assignment_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT coalesce(public.cf_can_record_expense(assignment.project_id),false) THEN RAISE EXCEPTION 'Assigned project management required' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO person FROM public.workers WHERE id=assignment.worker_id;
 person:=coalesce(person,assignment.worker_id);
 PERFORM 1 FROM public.profiles WHERE id=person FOR UPDATE;
 DELETE FROM public.site_workers sw WHERE sw.project_id=assignment.project_id AND (sw.worker_id=person OR sw.worker_id IN (SELECT id FROM public.workers WHERE user_id=person));
 DELETE FROM public.project_role_assignments WHERE project_id=assignment.project_id AND user_id=person AND lower(replace(role,' ','_'))='worker';
 UPDATE public.workers SET site_id=NULL WHERE user_id=person;
END $$;
REVOKE ALL ON FUNCTION public.assign_project_worker(uuid,uuid),public.remove_project_worker(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_project_worker(uuid,uuid),public.remove_project_worker(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cf_payroll_amount_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; detail_total numeric:=0; item_amount numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.deductions,NEW.deduction_details,NEW.basic_pay,NEW.overtime_pay,NEW.total_amount,NEW.total_pay,NEW.pay_basis,NEW.salary_rate) IS DISTINCT FROM (OLD.deductions,OLD.deduction_details,OLD.basic_pay,OLD.overtime_pay,OLD.total_amount,OLD.total_pay,OLD.pay_basis,OLD.salary_rate) THEN RAISE EXCEPTION 'Generated payroll amounts are immutable'; END IF;
 IF NEW.pay_basis='monthly' AND public.cf_current_role()<>'super_admin' THEN RAISE EXCEPTION 'Only administrators manage staff salary' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 IF NEW.deductions IS NULL OR NEW.deductions<0 OR NEW.deductions::text IN ('NaN','Infinity','-Infinity') OR NEW.deductions>coalesce(NEW.basic_pay,0)+coalesce(NEW.overtime_pay,0) THEN RAISE EXCEPTION 'Invalid payroll deductions'; END IF;
 IF jsonb_typeof(NEW.deduction_details)<>'array' THEN RAISE EXCEPTION 'Invalid deduction details'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.deduction_details) LOOP
  item_amount:=(item->>'amount')::numeric;
  IF item_amount IS NULL OR item_amount<0 OR item_amount<>round(item_amount,2) OR item_amount::text IN ('NaN','Infinity','-Infinity') OR nullif(trim(item->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Invalid deduction amount or reason'; END IF;
  detail_total:=detail_total+item_amount;
 END LOOP;
 IF detail_total<>NEW.deductions THEN RAISE EXCEPTION 'Deduction details do not match the deduction total'; END IF;
 IF TG_OP='INSERT' AND NEW.deductions>0 AND (NEW.total_amount IS DISTINCT FROM coalesce(NEW.basic_pay,0)+coalesce(NEW.overtime_pay,0)-NEW.deductions OR NEW.total_pay IS DISTINCT FROM NEW.total_amount OR jsonb_array_length(NEW.deduction_details)=0) THEN RAISE EXCEPTION 'Deductions must match the net salary and include reasons'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payroll_amount_guard ON public.salary_slips;
CREATE TRIGGER payroll_amount_guard BEFORE INSERT OR UPDATE ON public.salary_slips FOR EACH ROW EXECUTE FUNCTION public.cf_payroll_amount_guard();
DROP POLICY IF EXISTS staff_slip_own_read ON public.salary_slips;
CREATE POLICY staff_slip_own_read ON public.salary_slips FOR SELECT TO authenticated USING(worker_id=auth.uid());
DROP POLICY IF EXISTS staff_slip_privacy ON public.salary_slips;
CREATE POLICY staff_slip_privacy ON public.salary_slips AS RESTRICTIVE FOR SELECT TO authenticated USING(pay_basis IS DISTINCT FROM 'monthly' OR public.cf_current_role()='super_admin' OR worker_id=auth.uid());
DROP POLICY IF EXISTS staff_slip_delete_guard ON public.salary_slips;
CREATE POLICY staff_slip_delete_guard ON public.salary_slips AS RESTRICTIVE FOR DELETE TO authenticated USING(pay_basis IS DISTINCT FROM 'monthly' OR public.cf_current_role()='super_admin');

CREATE OR REPLACE FUNCTION public.create_staff_salary(p_employee_id uuid,p_project_id uuid,p_month date,p_deduction numeric DEFAULT 0,p_reason text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE employee public.profiles%ROWTYPE; salary numeric; end_date date; saved jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.cf_current_role()<>'super_admin' THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO employee FROM public.profiles WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND OR employee.is_approved IS NOT TRUE OR lower(replace(employee.role,' ','_')) NOT IN ('pm','project_manager','site_manager') THEN RAISE EXCEPTION 'Choose an approved staff member'; END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Choose a salary month'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND pm_id=p_employee_id)
 AND NOT EXISTS(SELECT 1 FROM public.site_manager_sites WHERE project_id=p_project_id AND site_manager_id=p_employee_id)
 AND NOT EXISTS(SELECT 1 FROM public.project_role_assignments WHERE project_id=p_project_id AND user_id=p_employee_id AND lower(replace(role,' ','_')) IN ('pm','project_manager','site_manager')) THEN RAISE EXCEPTION 'Staff member is not assigned to this project'; END IF;
 SELECT monthly_salary INTO salary FROM public.staff_compensation WHERE user_id=p_employee_id FOR SHARE;
 IF salary IS NULL OR salary<=0 OR p_deduction IS NULL OR p_deduction<0 OR p_deduction>salary OR p_deduction::text IN ('NaN','Infinity','-Infinity') OR p_deduction<>round(p_deduction,2) OR (p_deduction>0 AND nullif(trim(p_reason),'') IS NULL) THEN RAISE EXCEPTION 'Set monthly salary and valid deductions first'; END IF;
 end_date:=(p_month+interval '1 month'-interval '1 day')::date;
 IF EXISTS(SELECT 1 FROM public.salary_slips WHERE worker_id=p_employee_id AND period_start<=end_date AND period_end>=p_month) THEN RAISE EXCEPTION 'Salary already exists for this month' USING ERRCODE='23505'; END IF;
 INSERT INTO public.salary_slips(worker_id,project_id,month,period_start,period_end,basic_pay,overtime_pay,total_days,total_hours,overtime_hours,deductions,deduction_details,total_pay,total_amount,pay_basis,salary_rate,status)
 VALUES(p_employee_id,p_project_id,p_month,p_month,end_date,salary,0,0,0,0,p_deduction,CASE WHEN p_deduction>0 THEN jsonb_build_array(jsonb_build_object('amount',p_deduction,'reason',trim(p_reason))) ELSE '[]'::jsonb END,salary-p_deduction,salary-p_deduction,'monthly',salary,'Draft')
 RETURNING to_jsonb(salary_slips.*) INTO saved;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.create_staff_salary(uuid,uuid,date,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_staff_salary(uuid,uuid,date,numeric,text) TO authenticated;
DO $$ DECLARE table_name text; BEGIN
 IF to_regprocedure('public.cf_capture_audit_event()') IS NOT NULL THEN
  FOREACH table_name IN ARRAY ARRAY['username_accounts','staff_compensation'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS capture_staff_identity_audit ON public.%I',table_name);
   EXECUTE format('CREATE TRIGGER capture_staff_identity_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cf_capture_audit_event()',table_name);
  END LOOP;
 END IF;
END $$;
COMMIT;
