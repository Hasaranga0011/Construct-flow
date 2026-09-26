-- Phase 6: client_payment_schedule table.
-- Tracks payment milestones agreed between client and admin/PM.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_payment_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'Pending'
              CHECK (status IN ('Pending','Paid','Overdue','Waived')),
  paid_at     timestamptz,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_schedule_project
  ON public.client_payment_schedule (project_id, due_date);

-- RLS
ALTER TABLE public.client_payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payment_schedule FORCE ROW LEVEL SECURITY;

-- Admin: full access.
CREATE POLICY payment_schedule_admin ON public.client_payment_schedule
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- PM: read/write for their own projects.
CREATE POLICY payment_schedule_pm_select ON public.client_payment_schedule
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  );

CREATE POLICY payment_schedule_pm_write ON public.client_payment_schedule
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  );

-- Client: read-only their own project schedules.
CREATE POLICY payment_schedule_client_select ON public.client_payment_schedule
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
    AND project_id IN (SELECT id FROM public.projects WHERE client_id = auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.client_payment_schedule FROM anon;

COMMIT;
