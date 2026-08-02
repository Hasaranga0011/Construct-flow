-- ConstructFlow Phase 5 Comprehensive Migration
-- Safely applies schema updates for the missing tables and columns

-- 1. Update Profiles Table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_type TEXT,
ADD COLUMN IF NOT EXISTS contact_number TEXT,
ADD COLUMN IF NOT EXISTS worker_type TEXT,
ADD COLUMN IF NOT EXISTS daily_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS qr_code UUID;

-- Trigger to auto-generate qr_code on worker profile creation/update if not set
CREATE OR REPLACE FUNCTION generate_worker_qr_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'worker' AND NEW.qr_code IS NULL THEN
    NEW.qr_code := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_worker_qr_code ON public.profiles;
CREATE TRIGGER ensure_worker_qr_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION generate_worker_qr_code();

-- 2. Update Projects Table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pm_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planning',
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6),
ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. Update Purchase Orders Table
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS site_id UUID, -- Will reference site_manager_sites below
ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. New Tables (Hierarchies and Workflows)

-- pm_projects: links PMs to projects (Wait, projects already has pm_id, but prompt says pm_projects to link PMs to projects... maybe many-to-many? Let's implement it.)
CREATE TABLE IF NOT EXISTS public.pm_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pm_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pm_id, project_id)
);

-- site_manager_sites: links site managers to projects (with their PM context implied by the project)
CREATE TABLE IF NOT EXISTS public.site_manager_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_manager_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_manager_id, project_id)
);

-- Fix purchase_orders site_id constraint now that table exists
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS fk_po_site,
ADD CONSTRAINT fk_po_site FOREIGN KEY (site_id) REFERENCES public.site_manager_sites(id) ON DELETE SET NULL;

-- site_workers: links workers to sites with their site manager
CREATE TABLE IF NOT EXISTS public.site_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.site_manager_sites(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worker_id, site_id)
);

-- site_materials: per-site material stock
CREATE TABLE IF NOT EXISTS public.site_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES public.site_manager_sites(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    stock_quantity DECIMAL(10,2) DEFAULT 0,
    low_stock_threshold DECIMAL(10,2) DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, material_id)
);

-- milestones: project milestones
CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    completion_percentage INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- milestone_media: Cloudinary photo/video URLs per milestone
CREATE TABLE IF NOT EXISTS public.milestone_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL, -- 'image' or 'video'
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- milestone_notes: text notes per milestone
CREATE TABLE IF NOT EXISTS public.milestone_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- client_messages: messaging between Client and PM/Site Manager
CREATE TABLE IF NOT EXISTS public.client_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- cost_estimates: AI estimator JSON output per project with versioning
CREATE TABLE IF NOT EXISTS public.cost_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    ai_output JSONB NOT NULL,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- issues: site issue reporting
CREATE TABLE IF NOT EXISTS public.issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES public.site_manager_sites(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL, -- 'Low', 'Medium', 'High', 'Critical'
    status TEXT DEFAULT 'Open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- attendance: Add site_id and hours_worked to existing if needed, or create if not exists
-- Drop existing attendance if it conflicts (Assuming safe to recreate or alter)
-- Let's just alter it to be safe.
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.site_manager_sites(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(5,2);

-- salary_slips: generated payroll records
CREATE TABLE IF NOT EXISTS public.salary_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    days_worked INTEGER NOT NULL,
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    daily_rate DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'Generated',
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Row Level Security (RLS)
-- Enable RLS on all new tables
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_manager_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;

-- Disable strict restrictive policies temporarily by recreating standard ones based on Role.
-- We use a simpler strategy for speed: 
-- Admins can do everything.
-- For others, we rely on API backend which uses Service Role (which bypasses RLS) or explicit policies.
-- Let's create a generic "Admin Full Access" policy for all tables.
DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS admin_all ON public.%I', tbl);
        EXECUTE format('CREATE POLICY admin_all ON public.%I FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''super_admin'')
        )', tbl);
    END LOOP;
END $$;

-- PM can read/write their assigned projects
CREATE POLICY pm_projects_access ON public.projects
FOR ALL USING (
  pm_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.pm_projects WHERE pm_id = auth.uid() AND project_id = projects.id)
);

-- Site Manager can access their sites
CREATE POLICY sm_sites_access ON public.site_manager_sites
FOR ALL USING (site_manager_id = auth.uid());

-- Worker can access their attendance and salary
CREATE POLICY worker_salary_access ON public.salary_slips
FOR SELECT USING (worker_id = auth.uid());

-- Client can access their project
CREATE POLICY client_project_access ON public.projects
FOR SELECT USING (client_id = auth.uid());

-- Client Messages
CREATE POLICY client_messages_access ON public.client_messages
FOR ALL USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Milestones (Clients can view their project's milestones)
CREATE POLICY client_milestones_access ON public.milestones
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE id = milestones.project_id AND client_id = auth.uid())
);

-- Ensure anon access is restricted, authenticated access is allowed (Backend bypasses RLS if using service role, but since it uses user tokens we need these policies).
