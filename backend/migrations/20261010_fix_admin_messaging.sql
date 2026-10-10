-- Fix to allow clients to message super admins
-- 1. Update cf_user_project_access to automatically grant access if the user is a super_admin.
-- 2. Update cf_profile_access to allow anyone to read super_admin profiles.

CREATE OR REPLACE FUNCTION public.cf_user_project_access(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_project_id IS NOT NULL AND (
    (SELECT role FROM public.profiles WHERE id = p_user_id) = 'super_admin'
    OR EXISTS (SELECT 1 FROM public.projects p
            WHERE p.id = p_project_id AND p_user_id IN (p.pm_id, p.client_id))
    OR EXISTS (SELECT 1 FROM public.pm_projects pp
               WHERE pp.project_id = p_project_id AND pp.pm_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.project_role_assignments pra
               WHERE pra.project_id = p_project_id AND pra.user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.site_manager_sites sms
               WHERE sms.project_id = p_project_id AND sms.site_manager_id = p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.site_workers sw
      JOIN public.workers w ON w.id = sw.worker_id
      WHERE sw.project_id = p_project_id AND w.user_id = p_user_id
    )
  )
$$;


CREATE OR REPLACE FUNCTION public.cf_profile_access(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_profile_id = auth.uid()
    OR public.cf_is_admin()
    OR (SELECT role FROM public.profiles WHERE id = p_profile_id) = 'super_admin'
    OR (public.cf_role() IN ('pm','site_manager') AND EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.user_id = p_profile_id AND public.cf_worker_access(w.id)
    ))
    OR (public.cf_role() IN ('pm','site_manager','client') AND EXISTS (
      SELECT 1 FROM public.project_role_assignments a
      WHERE a.user_id = p_profile_id AND public.cf_project_access(a.project_id)
    ))
  )
$$;
