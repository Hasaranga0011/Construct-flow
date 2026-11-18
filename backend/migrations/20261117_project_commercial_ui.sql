BEGIN;
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
COMMIT;
