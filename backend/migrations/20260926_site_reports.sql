-- Phase 7: site_reports table.
-- Stores daily site reports submitted by site managers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id              uuid REFERENCES public.sites(id),
  site_manager_id      uuid NOT NULL REFERENCES public.profiles(id),
  date                 date NOT NULL,
  work_completed       text NOT NULL,
  workers_present_count int,
  materials_used       jsonb,              -- e.g. [{"name":"Cement","qty":10,"unit":"bags"}]
  photos               text[],             -- Cloudinary URLs
  blockers             text,
  created_at           timestamptz DEFAULT now(),
  -- Prevent duplicate reports per site manager per day per site.
  CONSTRAINT site_reports_unique_day UNIQUE (project_id, site_manager_id, date)
);

CREATE INDEX IF NOT EXISTS idx_site_reports_project_date
  ON public.site_reports (project_id, date DESC);

-- RLS
ALTER TABLE public.site_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_reports FORCE ROW LEVEL SECURITY;

-- Admin: full access.
CREATE POLICY site_reports_admin ON public.site_reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- PM: read reports for their projects; cannot create or edit.
CREATE POLICY site_reports_pm_select ON public.site_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  );

-- Site manager: insert/read own reports for assigned projects.
CREATE POLICY site_reports_sm_select ON public.site_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'site_manager')
    AND (
      site_manager_id = auth.uid()
      OR project_id IN (
        SELECT project_id FROM public.site_manager_sites WHERE site_manager_id = auth.uid()
      )
    )
  );

CREATE POLICY site_reports_sm_insert ON public.site_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'site_manager')
    AND site_manager_id = auth.uid()
    AND project_id IN (
      SELECT project_id FROM public.site_manager_sites WHERE site_manager_id = auth.uid()
    )
  );

-- Update: site manager can edit their own reports on the same day.
CREATE POLICY site_reports_sm_update ON public.site_reports
  FOR UPDATE TO authenticated
  USING (
    site_manager_id = auth.uid()
    AND date = CURRENT_DATE
  )
  WITH CHECK (
    site_manager_id = auth.uid()
    AND date = CURRENT_DATE
  );

-- Client: read-only on their own project reports.
CREATE POLICY site_reports_client_select ON public.site_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
    AND project_id IN (SELECT id FROM public.projects WHERE client_id = auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.site_reports FROM anon;

COMMIT;
