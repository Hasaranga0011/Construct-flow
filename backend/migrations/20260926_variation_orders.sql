-- Phase 6: variation_orders table.
-- Tracks scope changes / variation orders for client projects.

BEGIN;

CREATE TABLE IF NOT EXISTS public.variation_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status      text NOT NULL DEFAULT 'Pending'
              CHECK (status IN ('Pending','Approved','Rejected','Implemented')),
  created_by  uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variation_orders_project
  ON public.variation_orders (project_id, created_at DESC);

-- RLS
ALTER TABLE public.variation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variation_orders FORCE ROW LEVEL SECURITY;

-- Admin: full access.
CREATE POLICY variation_orders_admin ON public.variation_orders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- PM: read/write for their own projects.
CREATE POLICY variation_orders_pm ON public.variation_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
    AND project_id IN (SELECT id FROM public.projects WHERE pm_id = auth.uid())
  );

-- Client: read-only on their own project variation orders.
CREATE POLICY variation_orders_client_select ON public.variation_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
    AND project_id IN (SELECT id FROM public.projects WHERE client_id = auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.variation_orders FROM anon;

COMMIT;
