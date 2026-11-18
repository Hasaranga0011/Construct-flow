-- Requires 20261116_security_workflow_integrity.sql and preceding schema migrations.
BEGIN;
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
COMMIT;
