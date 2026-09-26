CREATE TABLE IF NOT EXISTS public.project_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'pm', 'client', 'site_manager', 'worker', 'supplier')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id, role)
);

ALTER TABLE public.project_role_assignments ENABLE ROW LEVEL SECURITY;

-- Policies are installed by backend/migrations/20260925_harden_core_rls.sql.
-- This bootstrap stays fail-closed when hardening has not run.
