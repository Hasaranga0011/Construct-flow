-- ConstructFlow Schema Part 3 (Project Manager Extensions)

-- 1. Payroll Table
CREATE TABLE IF NOT EXISTS public.payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES public.projects(id),
    worker_id UUID REFERENCES public.labour(id),
    month_year TEXT NOT NULL, -- e.g., '2023-10'
    total_days INT NOT NULL DEFAULT 0,
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid'))
);

-- 2. Milestones Table (Client Portal)
CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES public.projects(id),
    title TEXT NOT NULL,
    completion_percentage INT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    status TEXT DEFAULT 'In Progress' CHECK (status IN ('Not Started', 'In Progress', 'Completed', 'Delayed'))
);

-- 3. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'alert', 'success', 'warning')),
    is_read BOOLEAN DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Permissive Policies (FOR DEVELOPMENT MVP ONLY)
-- Payroll policies are installed by the canonical hardening migration.
-- Milestone and notification policies are installed by the canonical hardening migration.
