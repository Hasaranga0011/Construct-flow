-- PHASE 1: CONSTRUCTFLOW ARCHITECTURE UPGRADE
-- Run this script in the Supabase SQL Editor.

-- ============================================================================
-- 1. HIERARCHY ASSIGNMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS pm_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pm_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(pm_id, project_id)
);

CREATE TABLE IF NOT EXISTS site_manager_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    pm_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- the PM overseeing this SM
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(site_manager_id, site_id)
);

CREATE TABLE IF NOT EXISTS site_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    site_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(worker_id, site_id)
);

-- ============================================================================
-- 2. WORKER & SUPPLIER DETAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_details (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    worker_type TEXT NOT NULL CHECK (worker_type IN ('mason', 'carpenter', 'electrician', 'general_laborer', 'plumber')),
    daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    qr_code UUID UNIQUE DEFAULT gen_random_uuid(), -- uniquely generated per worker
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: We already have a `suppliers` table created previously. 
-- We will augment it with the missing 'supplier_type' field specified in the new requirements.
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS supplier_type TEXT CHECK (supplier_type IN ('electrical', 'plumbing', 'cement', 'steel', 'timber', 'finishing', 'general'));

-- ============================================================================
-- 3. SITE-SPECIFIC MATERIALS & PO UPDATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_materials (
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    stock_quantity NUMERIC(10, 2) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (site_id, material_id)
);

-- Add site_id to purchase orders so orders are bound to a site
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE;

-- Trigger to increment site-specific stock when a PO is marked 'Delivered'
CREATE OR REPLACE FUNCTION increment_site_stock_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to 'Delivered'
    IF NEW.status = 'Delivered' AND OLD.status != 'Delivered' THEN
        -- Insert or Update site_materials for the specific site and material
        INSERT INTO site_materials (site_id, material_id, stock_quantity)
        VALUES (NEW.site_id, NEW.material_id, NEW.quantity_ordered)
        ON CONFLICT (site_id, material_id) 
        DO UPDATE SET stock_quantity = site_materials.stock_quantity + NEW.quantity_ordered,
                      last_updated = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS po_delivery_stock_trigger ON purchase_orders;
CREATE TRIGGER po_delivery_stock_trigger
AFTER UPDATE OF status ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION increment_site_stock_on_delivery();

-- ============================================================================
-- 4. MILESTONE MEDIA, NOTES, & MESSAGING
-- ============================================================================

-- Note: The spec says project milestones should have title, description, start/end dates, etc.
-- Let's ensure a milestones table exists if it doesn't already, or assume it does.
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
    media_type TEXT CHECK (media_type IN ('photo', 'video')),
    url TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS client_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 5. LOCATIONS, ISSUES, & SALARIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_locations (
    project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Extending existing quotations table or creating cost_estimates as requested
CREATE TABLE IF NOT EXISTS cost_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    version INTEGER DEFAULT 1,
    labour_cost NUMERIC(15, 2) DEFAULT 0,
    materials_cost NUMERIC(15, 2) DEFAULT 0,
    overhead_cost NUMERIC(15, 2) DEFAULT 0,
    total_cost NUMERIC(15, 2) DEFAULT 0,
    raw_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Issues reporting from Site Managers
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Salary generation outputs
CREATE TABLE IF NOT EXISTS salary_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- usually stored as 'YYYY-MM-01'
    total_days INTEGER DEFAULT 0,
    total_hours NUMERIC(10, 2) DEFAULT 0,
    overtime_hours NUMERIC(10, 2) DEFAULT 0,
    basic_pay NUMERIC(12, 2) DEFAULT 0,
    overtime_pay NUMERIC(12, 2) DEFAULT 0,
    total_pay NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Approved', 'Paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- NOTE: In production, these should be hardened. We set them up here to rely
-- on the newly created hierarchy assignment tables.

ALTER TABLE pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_manager_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY;

-- Admins can do everything. Use a helper function for clarity.
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PMs can view their assigned projects
CREATE POLICY pm_projects_select ON pm_projects FOR SELECT USING (
  is_admin() OR pm_id = auth.uid()
);

-- Site Managers can view their assigned sites
CREATE POLICY site_manager_sites_select ON site_manager_sites FOR SELECT USING (
  is_admin() OR site_manager_id = auth.uid() OR pm_id = auth.uid()
);

-- Workers can view their assignment
CREATE POLICY site_workers_select ON site_workers FOR SELECT USING (
  is_admin() OR worker_id = auth.uid() OR site_manager_id = auth.uid()
);

-- Site Materials viewable by Admin, PM of that site, or Site Manager of that site
CREATE POLICY site_materials_select ON site_materials FOR SELECT USING (
  is_admin() OR
  EXISTS (SELECT 1 FROM site_manager_sites WHERE site_manager_id = auth.uid() AND site_id = site_materials.site_id) OR
  EXISTS (SELECT 1 FROM sites s JOIN pm_projects pp ON s.project_id = pp.project_id WHERE s.id = site_materials.site_id AND pp.pm_id = auth.uid())
);

-- Issues viewable by Admin, PM, Site Manager
CREATE POLICY issues_select ON issues FOR SELECT USING (
  is_admin() OR reported_by = auth.uid() OR
  EXISTS (SELECT 1 FROM sites s JOIN pm_projects pp ON s.project_id = pp.project_id WHERE s.id = issues.site_id AND pp.pm_id = auth.uid())
);

-- Salary Slips viewable by Admin, PM, and the Worker themselves
CREATE POLICY salary_slips_select ON salary_slips FOR SELECT USING (
  is_admin() OR worker_id = auth.uid() OR
  EXISTS (SELECT 1 FROM site_workers sw JOIN site_manager_sites sms ON sw.site_id = sms.site_id WHERE sw.worker_id = salary_slips.worker_id AND sms.pm_id = auth.uid())
);
