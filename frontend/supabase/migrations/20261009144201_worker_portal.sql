-- Canonical worker attendance, preserving QR history in attendance.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SEQUENCE IF NOT EXISTS public.worker_code_seq;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS worker_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"email":true,"in_app":true}'::jsonb;
UPDATE public.profiles SET worker_code = 'W-' || lpad(nextval('public.worker_code_seq')::text, greatest(4,length(currval('public.worker_code_seq')::text)), '0') WHERE worker_code IS NULL AND lower(role) = 'worker';
CREATE UNIQUE INDEX IF NOT EXISTS profiles_worker_code_unique ON public.profiles(worker_code);
CREATE OR REPLACE FUNCTION private.assign_worker_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF lower(NEW.role) = 'worker' AND NEW.worker_code IS NULL THEN
  NEW.worker_code := 'W-' || lpad(nextval('public.worker_code_seq')::text, greatest(4,length(currval('public.worker_code_seq')::text)), '0');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.assign_worker_code() FROM PUBLIC;
CREATE TRIGGER assign_worker_code BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.assign_worker_code();
CREATE OR REPLACE FUNCTION private.protect_worker_contact_fields() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() = OLD.id AND public.cf_role() = 'worker' AND
  (to_jsonb(NEW) - ARRAY['full_name','contact_number','avatar_url','bio','address','emergency_contact','notification_preferences']) IS DISTINCT FROM
  (to_jsonb(OLD) - ARRAY['full_name','contact_number','avatar_url','bio','address','emergency_contact','notification_preferences']) THEN
  RAISE EXCEPTION 'Workers may only update their own contact details and preferences' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_worker_contact_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_worker_contact_fields();
GRANT UPDATE(notification_preferences) ON public.profiles TO authenticated;

CREATE TABLE public.labour (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 worker_id uuid NOT NULL REFERENCES public.profiles(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),
 site_id uuid REFERENCES public.sites(id),
 site_name text,
 date date NOT NULL,
 status text NOT NULL DEFAULT 'Present' CHECK(status IN ('Present','Absent','On Leave','Not scheduled')),
 check_in_time timestamptz,
 check_out_time timestamptz,
 hours_worked numeric NOT NULL DEFAULT 0 CHECK(hours_worked >= 0),
 overtime_hours numeric NOT NULL DEFAULT 0 CHECK(overtime_hours >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX labour_worker_date_idx ON public.labour(worker_id,date DESC);
CREATE UNIQUE INDEX labour_worker_site_date_unique ON public.labour(worker_id,site_id,date);
ALTER TABLE public.labour ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.labour TO authenticated;
CREATE POLICY worker_labour_read ON public.labour FOR SELECT TO authenticated USING (
 worker_id = (SELECT auth.uid()) OR public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));
CREATE POLICY worker_labour_manage ON public.labour FOR ALL TO authenticated USING (
 public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id))) WITH CHECK (
 public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));
CREATE POLICY worker_labour_no_delete ON public.labour AS RESTRICTIVE FOR DELETE TO authenticated USING (public.cf_role() <> 'worker');
CREATE POLICY worker_salary_no_delete ON public.salary_slips AS RESTRICTIVE FOR DELETE TO authenticated USING (public.cf_role() <> 'worker');
CREATE POLICY worker_profile_no_delete ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING (public.cf_role() <> 'worker');
CREATE POLICY worker_attendance_no_delete ON public.attendance AS RESTRICTIVE FOR DELETE TO authenticated USING (public.cf_role() <> 'worker');
-- Restrictive guards remain effective even alongside older permissive policies.
CREATE POLICY worker_labour_boundary ON public.labour AS RESTRICTIVE FOR ALL TO authenticated USING (public.cf_role() <> 'worker' OR worker_id = (SELECT auth.uid())) WITH CHECK (public.cf_role() <> 'worker');
CREATE POLICY manager_salary_profile_ids ON public.salary_slips FOR ALL TO authenticated
 USING (public.cf_role() = 'pm' AND EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id=salary_slips.worker_id AND public.cf_worker_access(w.id)))
 WITH CHECK (public.cf_role() = 'pm' AND EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id=salary_slips.worker_id AND public.cf_worker_access(w.id)));
CREATE POLICY worker_salary_read ON public.salary_slips FOR SELECT TO authenticated USING (worker_id = (SELECT auth.uid()));
CREATE POLICY worker_salary_boundary ON public.salary_slips AS RESTRICTIVE FOR ALL TO authenticated USING (public.cf_role() <> 'worker' OR worker_id = (SELECT auth.uid())) WITH CHECK (public.cf_role() <> 'worker');
CREATE POLICY worker_profile_boundary ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated USING (public.cf_role() <> 'worker' OR id = (SELECT auth.uid())) WITH CHECK (public.cf_role() <> 'worker' OR id = (SELECT auth.uid()));
CREATE POLICY worker_legacy_attendance_boundary ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated USING (public.cf_role() <> 'worker' OR public.cf_worker_owned_by(worker_id,(SELECT auth.uid()))) WITH CHECK (public.cf_role() <> 'worker');

INSERT INTO public.labour(id,worker_id,project_id,site_id,site_name,date,status,check_in_time,check_out_time,hours_worked,overtime_hours,created_at)
 SELECT a.id,w.user_id,s.project_id,s.id,coalesce(s.address,p.name),a.date,'Present',a.check_in_time,a.check_out_time,coalesce(a.hours_worked,0),greatest(coalesce(a.overtime_hours,0),greatest(coalesce(a.hours_worked,0)-8,0)),a.created_at
 FROM public.attendance a JOIN public.workers w ON w.id=a.worker_id JOIN public.sites s ON s.id=a.site_id JOIN public.projects p ON p.id=s.project_id;
CREATE OR REPLACE FUNCTION private.sync_worker_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN DELETE FROM public.labour WHERE id=OLD.id; RETURN OLD; END IF;
 INSERT INTO public.labour(id,worker_id,project_id,site_id,site_name,date,status,check_in_time,check_out_time,hours_worked,overtime_hours,created_at)
 SELECT NEW.id,w.user_id,s.project_id,s.id,coalesce(s.address,p.name),NEW.date,'Present',NEW.check_in_time,NEW.check_out_time,coalesce(NEW.hours_worked,0),greatest(coalesce(NEW.overtime_hours,0),greatest(coalesce(NEW.hours_worked,0)-8,0)),NEW.created_at
 FROM public.workers w JOIN public.sites s ON s.id=NEW.site_id JOIN public.projects p ON p.id=s.project_id WHERE w.id=NEW.worker_id
 ON CONFLICT(id) DO UPDATE SET check_in_time=EXCLUDED.check_in_time,check_out_time=EXCLUDED.check_out_time,hours_worked=EXCLUDED.hours_worked,overtime_hours=EXCLUDED.overtime_hours,date=EXCLUDED.date;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_worker_attendance AFTER INSERT OR UPDATE OR DELETE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.sync_worker_attendance();
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS daily_rate numeric;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS deductions numeric NOT NULL DEFAULT 0;
CREATE SEQUENCE IF NOT EXISTS public.payslip_number_seq;
ALTER TABLE public.salary_slips ADD COLUMN IF NOT EXISTS slip_number text DEFAULT ('PAY-' || nextval('public.payslip_number_seq')::text);
UPDATE public.salary_slips SET daily_rate = basic_pay / total_days WHERE daily_rate IS NULL AND total_days > 0;
CREATE INDEX IF NOT EXISTS salary_worker_period_idx ON public.salary_slips(worker_id,period_start DESC);
GRANT USAGE ON SEQUENCE public.payslip_number_seq TO authenticated;
-- Expand the existing status check without rewriting historical approvals.
ALTER TABLE public.salary_slips DROP CONSTRAINT IF EXISTS salary_slips_status_check;
ALTER TABLE public.salary_slips ADD CONSTRAINT salary_slips_status_check CHECK(status IN ('Draft','Approved','Pending','Generated','Paid')) NOT VALID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['labour','salary_slips','profiles','site_workers','notifications'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
  END IF;
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
