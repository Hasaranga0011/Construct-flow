-- Phase 1: Replace broad attendance RLS with per-role scoped policies.
-- Run AFTER 20260925_harden_core_rls.sql is applied to staging.
-- This migration is idempotent: it drops and recreates policies.
-- Run as database owner.

BEGIN;

-- Verify required helpers and foreign keys exist before touching policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'worker_id'
      AND ccu.table_name = 'workers' AND ccu.column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'attendance.worker_id must reference workers.id before applying attendance RLS';
  END IF;
END
$$;

-- Drop any existing broad attendance policies.
DO $$
DECLARE
  pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', pol_name);
  END LOOP;
END
$$;

-- Ensure RLS is enabled and forced on attendance.
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- SELECT policies
-- ─────────────────────────────────────────────────────────────

-- Admin: see all attendance rows.
CREATE POLICY attendance_select_admin ON public.attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- PM: see attendance for workers on their assigned projects only.
CREATE POLICY attendance_select_pm ON public.attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm'
    )
    AND
    worker_id IN (
      SELECT sw.worker_id
      FROM public.site_workers sw
      JOIN public.site_manager_sites sms ON sms.project_id = sw.project_id
      JOIN public.projects p ON p.id = sw.project_id
      WHERE p.pm_id = auth.uid()
    )
  );

-- Site manager: see attendance for their assigned sites only.
CREATE POLICY attendance_select_site_manager ON public.attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'site_manager'
    )
    AND
    site_id IN (
      SELECT id FROM public.sites WHERE site_manager_id = auth.uid()
      UNION
      SELECT id FROM public.site_manager_sites WHERE site_manager_id = auth.uid()
    )
  );

-- Worker: see only their own attendance records.
CREATE POLICY attendance_select_worker ON public.attendance
  FOR SELECT TO authenticated
  USING (
    worker_id = (
      SELECT id FROM public.workers WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ─────────────────────────────────────────────────────────────
-- INSERT policies
-- ─────────────────────────────────────────────────────────────

-- Admin: insert attendance anywhere.
CREATE POLICY attendance_insert_admin ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- PM: insert attendance for workers on their projects.
CREATE POLICY attendance_insert_pm ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm'
    )
    AND
    worker_id IN (
      SELECT sw.worker_id
      FROM public.site_workers sw
      JOIN public.projects p ON p.id = sw.project_id
      WHERE p.pm_id = auth.uid()
    )
  );

-- Site manager: insert attendance only for their assigned sites.
CREATE POLICY attendance_insert_site_manager ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'site_manager'
    )
    AND
    site_id IN (
      SELECT id FROM public.sites WHERE site_manager_id = auth.uid()
      UNION
      SELECT id FROM public.site_manager_sites WHERE site_manager_id = auth.uid()
    )
  );

-- Workers cannot self-insert attendance (QR scan goes through backend with JWT).

-- ─────────────────────────────────────────────────────────────
-- UPDATE policies (check-out time, hours_worked)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY attendance_update_admin ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY attendance_update_pm ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND
    worker_id IN (
      SELECT sw.worker_id FROM public.site_workers sw
      JOIN public.projects p ON p.id = sw.project_id
      WHERE p.pm_id = auth.uid()
    )
  );

CREATE POLICY attendance_update_site_manager ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'site_manager')
    AND
    site_id IN (
      SELECT id FROM public.sites WHERE site_manager_id = auth.uid()
      UNION
      SELECT id FROM public.site_manager_sites WHERE site_manager_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- DELETE: admin only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY attendance_delete_admin ON public.attendance
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ─────────────────────────────────────────────────────────────
-- Revoke anon access on attendance (should already be revoked by
-- 20260925_revoke_anon_writes.sql, but make explicit here).
-- ─────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.attendance FROM anon;

COMMIT;
