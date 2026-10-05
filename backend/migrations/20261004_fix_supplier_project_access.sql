BEGIN;

CREATE OR REPLACE FUNCTION public.cf_user_project_access(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_project_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.projects p
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
    OR EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.project_id = p_project_id AND po.supplier_id = p_user_id
    )
  )
$$;

COMMIT;
