-- ConstructFlow Core MVP Database Schema

-- 1. Projects Table
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold')),
    total_budget NUMERIC DEFAULT 0,
    pm_id UUID REFERENCES auth.users(id),
    client_id UUID REFERENCES auth.users(id)
);

-- 2. Labour Table (Workers)
CREATE TABLE public.labour (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    nic TEXT UNIQUE NOT NULL,
    trade TEXT NOT NULL,
    daily_rate NUMERIC NOT NULL,
    assigned_project_id UUID REFERENCES public.projects(id)
);

-- 3. Attendance Table (Daily Check-ins)
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES public.labour(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'Present' CHECK (status IN ('Present', 'Absent', 'Half-day')),
    logged_by UUID REFERENCES auth.users(id),
    UNIQUE(worker_id, date) -- A worker can only check in once per day
);

-- 4. Materials Inventory (Global Catalog)
CREATE TABLE public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    global_stock_quantity NUMERIC DEFAULT 0,
    low_stock_threshold NUMERIC DEFAULT 100
);

-- 5. Material Requests / Purchase Orders
CREATE TABLE public.material_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES public.projects(id),
    requested_by UUID REFERENCES auth.users(id),
    material_id UUID REFERENCES public.materials(id),
    item_name TEXT NOT NULL, -- denormalized for quick access
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    status TEXT DEFAULT 'Pending Approval' CHECK (status IN ('Pending Approval', 'Approved', 'Rejected', 'Ordered', 'Delivered')),
    notes TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

-- This bootstrap creates tables only. Canonical policies are installed by
-- backend/migrations/20260925_harden_core_rls.sql after schema reconciliation.

-- Project role assignments
CREATE TABLE IF NOT EXISTS public.project_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS public.project_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, admin_id)
);

ALTER TABLE public.project_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_admins ENABLE ROW LEVEL SECURITY;

-- Assignment tables remain fail-closed until scoped policies are installed.

CREATE TABLE IF NOT EXISTS public.project_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'pm', 'client', 'site_manager', 'worker', 'supplier')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id, role)
);

ALTER TABLE public.project_role_assignments ENABLE ROW LEVEL SECURITY;
-- No mock business rows or permissive policies belong in the production schema.
