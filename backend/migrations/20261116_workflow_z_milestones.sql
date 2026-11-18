BEGIN;
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
COMMIT;
