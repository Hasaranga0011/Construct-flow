-- Fix for: new row violates row-level security policy for table "projects"
-- Run this in your Supabase SQL Editor to allow authenticated users to create projects

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Allow any logged-in user to view all projects (already working but good to ensure)
CREATE POLICY "Allow authenticated users to select projects" 
ON public.projects FOR SELECT 
USING (auth.role() = 'authenticated');

-- Allow any logged-in user to create new projects
CREATE POLICY "Allow authenticated users to insert projects" 
ON public.projects FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Allow any logged-in user to update existing projects
CREATE POLICY "Allow authenticated users to update projects" 
ON public.projects FOR UPDATE 
USING (auth.role() = 'authenticated');
