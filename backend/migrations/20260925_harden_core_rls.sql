-- STAGING REVIEW REQUIRED. Do not run until the identity schema is confirmed.
-- The transaction aborts before policy changes when the deployed schema differs
-- from the canonical identity contract. Run as database owner after a backup.
-- This migration intentionally does not touch legacy labour rows.
BEGIN;

DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'profiles','projects','project_role_assignments','pm_projects',
    'sites','site_manager_sites','site_workers','workers','attendance',
    'materials','site_materials','material_requests',
    'purchase_orders','notifications','salary_slips','milestones',
    'milestone_media','milestone_notes','client_messages','messages',
    'shared_documents','client_activity','issues','project_expenses'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing; migration aborted', required_table;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  required_column text[];
  required_columns text[][] := ARRAY[
    ARRAY['profiles','id'], ARRAY['profiles','role'],
    ARRAY['projects','id'], ARRAY['projects','pm_id'], ARRAY['projects','client_id'],
    ARRAY['project_role_assignments','project_id'], ARRAY['project_role_assignments','user_id'],
    ARRAY['pm_projects','project_id'], ARRAY['pm_projects','pm_id'],
    ARRAY['sites','id'], ARRAY['sites','project_id'], ARRAY['sites','site_manager_id'],
    ARRAY['site_manager_sites','id'], ARRAY['site_manager_sites','project_id'], ARRAY['site_manager_sites','site_manager_id'],
    ARRAY['workers','id'], ARRAY['workers','user_id'],
    ARRAY['site_workers','worker_id'], ARRAY['site_workers','project_id'],
    ARRAY['attendance','worker_id'], ARRAY['attendance','site_id'],
    ARRAY['materials','id'], ARRAY['materials','project_id'],
    ARRAY['site_materials','site_id'], ARRAY['site_materials','material_id'],
    ARRAY['material_requests','project_id'], ARRAY['material_requests','requested_by'],
    ARRAY['purchase_orders','project_id'], ARRAY['purchase_orders','supplier_id'],
    ARRAY['notifications','target_user_id'], ARRAY['notifications','target_role'], ARRAY['notifications','is_read'],
    ARRAY['salary_slips','worker_id'],
    ARRAY['milestones','id'], ARRAY['milestones','project_id'],
    ARRAY['milestone_media','milestone_id'], ARRAY['milestone_media','uploaded_by'],
    ARRAY['milestone_notes','milestone_id'], ARRAY['milestone_notes','author_id'],
    ARRAY['client_messages','project_id'], ARRAY['client_messages','sender_id'], ARRAY['client_messages','receiver_id'],
    ARRAY['messages','project_id'], ARRAY['messages','sender_id'], ARRAY['messages','receiver_id'],
    ARRAY['shared_documents','project_id'], ARRAY['shared_documents','uploaded_by'],
    ARRAY['client_activity','project_id'], ARRAY['client_activity','client_id'],
    ARRAY['issues','site_id'], ARRAY['issues','reported_by'],
    ARRAY['project_expenses','project_id']
  ];
BEGIN
  FOREACH required_column SLICE 1 IN ARRAY required_columns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = required_column[1]
        AND column_name = required_column[2]
    ) THEN
      RAISE EXCEPTION 'Required column public.%.% is missing; migration aborted',
        required_column[1], required_column[2];
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'worker_id'
      AND ccu.table_name = 'workers' AND ccu.column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'attendance.worker_id must reference workers.id; migration aborted';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.cf_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE lower(replace(coalesce(role, ''), ' ', '_'))
    WHEN 'admin' THEN 'super_admin'
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'manager' THEN 'pm'
    WHEN 'project_manager' THEN 'pm'
    ELSE lower(replace(coalesce(role, ''), ' ', '_'))
  END
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.cf_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.cf_role() = 'super_admin' $$;

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
  )
$$;

CREATE OR REPLACE FUNCTION public.cf_project_access(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (public.cf_is_admin() OR public.cf_user_project_access(auth.uid(), p_project_id))
$$;

CREATE OR REPLACE FUNCTION public.cf_site_access(p_site_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.cf_is_admin()
    OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = p_site_id AND s.site_manager_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.site_manager_sites sms WHERE sms.id = p_site_id AND sms.site_manager_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.sites s
               JOIN public.site_workers sw ON sw.project_id = s.project_id
               JOIN public.workers w ON w.id = sw.worker_id
               WHERE s.id = p_site_id AND w.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = p_site_id AND public.cf_project_access(s.project_id))
    OR EXISTS (SELECT 1 FROM public.site_manager_sites sms
               WHERE sms.id = p_site_id AND public.cf_project_access(sms.project_id))
  )
$$;

CREATE OR REPLACE FUNCTION public.cf_worker_owned_by(p_worker_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_worker_id IS NOT NULL AND p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workers w WHERE w.id = p_worker_id AND w.user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.cf_worker_access(p_worker_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.cf_is_admin()
    OR public.cf_worker_owned_by(p_worker_id, auth.uid())
    OR (public.cf_role() IN ('pm','site_manager') AND EXISTS (
      SELECT 1 FROM public.site_workers sw
      WHERE sw.worker_id = p_worker_id AND public.cf_project_access(sw.project_id)
    ))
  )
$$;

CREATE OR REPLACE FUNCTION public.cf_profile_access(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_profile_id = auth.uid()
    OR public.cf_is_admin()
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

REVOKE ALL ON FUNCTION public.cf_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_user_project_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_project_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_site_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_worker_owned_by(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_worker_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cf_profile_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_user_project_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_project_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_site_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_worker_owned_by(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_worker_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf_profile_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cf_protect_profile_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.cf_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only an administrator can change account identity or role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.cf_protect_profile_identity() FROM PUBLIC;
DROP TRIGGER IF EXISTS cf_protect_profile_identity ON public.profiles;
CREATE TRIGGER cf_protect_profile_identity
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.cf_protect_profile_identity();

DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles','projects','project_role_assignments','pm_projects',
    'sites','site_manager_sites','site_workers','workers','attendance',
    'materials','site_materials','material_requests',
    'purchase_orders','notifications','salary_slips','milestones',
    'milestone_media','milestone_notes','client_messages','messages',
    'shared_documents','client_activity','issues','project_expenses'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access for %1$s" ON public.%1$s', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access to %1$s" ON public.%1$s', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all authenticated users full access to %1$s" ON public.%1$s', table_name);
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON public.%I', table_name);
  END LOOP;
END
$$;

REVOKE UPDATE ON public.profiles FROM authenticated;
DO $$
DECLARE
  safe_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO safe_columns
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name = ANY (ARRAY[
      'full_name','contact_number','phone','company_name','avatar_url','bio','address'
    ]);
  IF safe_columns IS NOT NULL THEN
    EXECUTE 'GRANT UPDATE (' || safe_columns || ') ON public.profiles TO authenticated';
  END IF;
END
$$;

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'profiles','projects','project_role_assignments','pm_projects',
        'sites','site_manager_sites','site_workers','workers','attendance',
        'materials','site_materials','material_requests',
        'purchase_orders','notifications','salary_slips','milestones',
        'milestone_media','milestone_notes','client_messages','messages',
        'shared_documents','client_activity','issues','project_expenses'
      ])
  LOOP
    EXECUTE 'DROP POLICY ' || quote_ident(policy_record.policyname)
      || ' ON ' || quote_ident(policy_record.schemaname)
      || '.' || quote_ident(policy_record.tablename);
  END LOOP;
END
$$;

CREATE POLICY cf_profiles_select ON public.profiles FOR SELECT TO authenticated
USING (public.cf_profile_access(id));
CREATE POLICY cf_profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.cf_is_admin())
WITH CHECK (id = auth.uid() OR public.cf_is_admin());

CREATE POLICY cf_projects_select ON public.projects FOR SELECT TO authenticated
USING (public.cf_role() <> 'supplier' AND public.cf_project_access(id));
CREATE POLICY cf_projects_insert ON public.projects FOR INSERT TO authenticated
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND pm_id = auth.uid()));
CREATE POLICY cf_projects_update ON public.projects FOR UPDATE TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND pm_id = auth.uid()))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND pm_id = auth.uid()));
CREATE POLICY cf_projects_delete ON public.projects FOR DELETE TO authenticated
USING (public.cf_is_admin());

CREATE POLICY cf_pm_projects_select ON public.pm_projects FOR SELECT TO authenticated
USING (pm_id = auth.uid() OR public.cf_is_admin()
  OR (public.cf_role() IN ('client','site_manager','worker') AND public.cf_project_access(project_id)));
CREATE POLICY cf_pm_projects_write ON public.pm_projects FOR ALL TO authenticated
USING (public.cf_is_admin()) WITH CHECK (public.cf_is_admin());

CREATE POLICY cf_assignments_select ON public.project_role_assignments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.cf_is_admin()
  OR (public.cf_role() IN ('pm','client','site_manager','worker') AND public.cf_project_access(project_id)));
CREATE POLICY cf_assignments_write ON public.project_role_assignments FOR ALL TO authenticated
USING (public.cf_is_admin()) WITH CHECK (public.cf_is_admin());

CREATE POLICY cf_sites_select ON public.sites FOR SELECT TO authenticated
USING (public.cf_role() <> 'supplier' AND (public.cf_project_access(project_id) OR site_manager_id = auth.uid()));
CREATE POLICY cf_sites_write ON public.sites FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));

CREATE POLICY cf_site_assignments_select ON public.site_manager_sites FOR SELECT TO authenticated
USING (site_manager_id = auth.uid() OR public.cf_is_admin()
  OR (public.cf_role() IN ('pm','client','worker') AND public.cf_project_access(project_id)));
CREATE POLICY cf_site_assignments_write ON public.site_manager_sites FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));

CREATE POLICY cf_workers_select ON public.workers FOR SELECT TO authenticated
USING (public.cf_worker_access(id));
CREATE POLICY cf_workers_write ON public.workers FOR ALL TO authenticated
USING (public.cf_is_admin()) WITH CHECK (public.cf_is_admin());

CREATE POLICY cf_worker_assignments_select ON public.site_workers FOR SELECT TO authenticated
USING (public.cf_is_admin()
  OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id))
  OR public.cf_worker_owned_by(worker_id, auth.uid()));
CREATE POLICY cf_worker_assignments_write ON public.site_workers FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));

CREATE POLICY cf_attendance_select ON public.attendance FOR SELECT TO authenticated
USING (public.cf_is_admin()
  OR public.cf_worker_owned_by(worker_id, auth.uid())
  OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)));
CREATE POLICY cf_attendance_insert ON public.attendance FOR INSERT TO authenticated
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)));
CREATE POLICY cf_attendance_update ON public.attendance FOR UPDATE TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)));

CREATE POLICY cf_materials_select ON public.materials FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager') AND public.cf_project_access(project_id));
CREATE POLICY cf_materials_write ON public.materials FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));

CREATE POLICY cf_site_materials_select ON public.site_materials FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager') AND public.cf_site_access(site_id));
CREATE POLICY cf_site_materials_write ON public.site_materials FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)));

CREATE POLICY cf_material_requests_select ON public.material_requests FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager') AND public.cf_project_access(project_id));
CREATE POLICY cf_material_requests_insert ON public.material_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid() AND public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id));
CREATE POLICY cf_material_requests_update ON public.material_requests FOR UPDATE TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));

CREATE POLICY cf_purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated
USING (public.cf_is_admin() OR supplier_id = auth.uid()
  OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));
CREATE POLICY cf_purchase_orders_insert ON public.purchase_orders FOR INSERT TO authenticated
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));
CREATE POLICY cf_purchase_orders_update ON public.purchase_orders FOR UPDATE TO authenticated
USING (public.cf_is_admin() OR supplier_id = auth.uid()
  OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR supplier_id = auth.uid()
  OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));

CREATE POLICY cf_notifications_select ON public.notifications FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR (target_user_id IS NULL AND CASE lower(replace(target_role, ' ', '_'))
    WHEN 'admin' THEN 'super_admin'
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'manager' THEN 'pm'
    WHEN 'project_manager' THEN 'pm'
    ELSE lower(replace(target_role, ' ', '_'))
  END IN ('all', public.cf_role()))
);
CREATE POLICY cf_notifications_insert ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.cf_is_admin() OR public.cf_role() IN ('pm','site_manager'));
CREATE POLICY cf_notifications_update ON public.notifications FOR UPDATE TO authenticated
USING (target_user_id = auth.uid())
WITH CHECK (target_user_id = auth.uid());

CREATE POLICY cf_salary_select ON public.salary_slips FOR SELECT TO authenticated
USING (public.cf_is_admin() OR public.cf_worker_owned_by(worker_id, auth.uid()));
CREATE POLICY cf_salary_write ON public.salary_slips FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_worker_access(worker_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_worker_access(worker_id)));

CREATE POLICY cf_milestones_select ON public.milestones FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager','client') AND public.cf_project_access(project_id));
CREATE POLICY cf_milestones_write ON public.milestones FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)));

CREATE POLICY cf_milestone_media_select ON public.milestone_media FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager','client') AND EXISTS (
  SELECT 1 FROM public.milestones m
  WHERE m.id = milestone_media.milestone_id AND public.cf_project_access(m.project_id)
));
CREATE POLICY cf_milestone_media_write ON public.milestone_media FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.cf_role() IN ('super_admin','pm','site_manager') AND EXISTS (
  SELECT 1 FROM public.milestones m
  WHERE m.id = milestone_media.milestone_id AND public.cf_project_access(m.project_id)
));

CREATE POLICY cf_milestone_notes_select ON public.milestone_notes FOR SELECT TO authenticated
USING (public.cf_role() IN ('super_admin','pm','site_manager','client') AND EXISTS (
  SELECT 1 FROM public.milestones m
  WHERE m.id = milestone_notes.milestone_id AND public.cf_project_access(m.project_id)
));
CREATE POLICY cf_milestone_notes_insert ON public.milestone_notes FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND public.cf_role() IN ('super_admin','pm','site_manager') AND EXISTS (
  SELECT 1 FROM public.milestones m
  WHERE m.id = milestone_notes.milestone_id AND public.cf_project_access(m.project_id)
));

CREATE POLICY cf_client_messages_select ON public.client_messages FOR SELECT TO authenticated
USING (public.cf_is_admin() OR sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY cf_client_messages_insert ON public.client_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND project_id IS NOT NULL
  AND public.cf_user_project_access(sender_id, project_id)
  AND public.cf_user_project_access(receiver_id, project_id));
CREATE POLICY cf_messages_select ON public.messages FOR SELECT TO authenticated
USING (public.cf_is_admin() OR sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY cf_messages_insert ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND project_id IS NOT NULL
  AND public.cf_user_project_access(sender_id, project_id)
  AND public.cf_user_project_access(receiver_id, project_id));

CREATE POLICY cf_documents_select ON public.shared_documents FOR SELECT TO authenticated
USING (project_id IS NOT NULL
  AND public.cf_role() IN ('super_admin','pm','site_manager','client')
  AND public.cf_project_access(project_id));
CREATE POLICY cf_documents_write ON public.shared_documents FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id)))
WITH CHECK (uploaded_by = auth.uid() AND project_id IS NOT NULL AND public.cf_project_access(project_id));

CREATE POLICY cf_activity_select ON public.client_activity FOR SELECT TO authenticated
USING (client_id = auth.uid() OR (project_id IS NOT NULL
  AND public.cf_role() IN ('super_admin','pm','site_manager')
  AND public.cf_project_access(project_id)));
CREATE POLICY cf_activity_insert ON public.client_activity FOR INSERT TO authenticated
WITH CHECK (project_id IS NOT NULL AND (public.cf_is_admin()
  OR (public.cf_role() IN ('pm','site_manager') AND public.cf_project_access(project_id))));

CREATE POLICY cf_issues_select ON public.issues FOR SELECT TO authenticated
USING (public.cf_site_access(site_id));
CREATE POLICY cf_issues_insert ON public.issues FOR INSERT TO authenticated
WITH CHECK (reported_by = auth.uid() AND public.cf_site_access(site_id));
CREATE POLICY cf_issues_update ON public.issues FOR UPDATE TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() IN ('pm','site_manager') AND public.cf_site_access(site_id)));

CREATE POLICY cf_expenses_select ON public.project_expenses FOR SELECT TO authenticated
USING (public.cf_project_access(project_id));
CREATE POLICY cf_expenses_write ON public.project_expenses FOR ALL TO authenticated
USING (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)))
WITH CHECK (public.cf_is_admin() OR (public.cf_role() = 'pm' AND public.cf_project_access(project_id)));

DO $$
DECLARE
  realtime_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH realtime_table IN ARRAY ARRAY[
      'profiles','projects','project_role_assignments','site_manager_sites','site_workers',
      'workers','attendance','materials','site_materials','material_requests',
      'purchase_orders','notifications','salary_slips','milestones','milestone_media',
      'client_messages','messages','shared_documents','client_activity','issues','project_expenses'
    ] LOOP
      EXECUTE 'ALTER TABLE public.' || quote_ident(realtime_table) || ' REPLICA IDENTITY FULL';
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = realtime_table
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.' || quote_ident(realtime_table);
      END IF;
    END LOOP;
  END IF;
END
$$;

COMMIT;
