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

-- Note: For testing purposes during rapid prototyping, we can create permissive policies.
-- In production, these must be heavily restricted based on the auth.uid() and user role.

-- Permissive Policies (FOR DEVELOPMENT MVP ONLY)
CREATE POLICY "Allow all read access for projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Allow all insert access for projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access for projects" ON public.projects FOR UPDATE USING (true);

CREATE POLICY "Allow all read access for labour" ON public.labour FOR SELECT USING (true);
CREATE POLICY "Allow all insert access for labour" ON public.labour FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access for labour" ON public.labour FOR UPDATE USING (true);

CREATE POLICY "Allow all read access for attendance" ON public.attendance FOR SELECT USING (true);
CREATE POLICY "Allow all insert access for attendance" ON public.attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access for attendance" ON public.attendance FOR UPDATE USING (true);

CREATE POLICY "Allow all read access for materials" ON public.materials FOR SELECT USING (true);
CREATE POLICY "Allow all insert access for materials" ON public.materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access for materials" ON public.materials FOR UPDATE USING (true);

CREATE POLICY "Allow all read access for material_requests" ON public.material_requests FOR SELECT USING (true);
CREATE POLICY "Allow all insert access for material_requests" ON public.material_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access for material_requests" ON public.material_requests FOR UPDATE USING (true);

-- Seed Data Example
INSERT INTO public.projects (name, location, status, total_budget)
VALUES 
  ('Colombo 07 Apartment', 'Colombo 07', 'active', 45000000),
  ('Kandy Villa', 'Kandy', 'active', 12000000);
