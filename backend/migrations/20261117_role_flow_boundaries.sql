-- Review and apply in Supabase SQL Editor. No business records are deleted.
BEGIN;

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
COMMIT;
