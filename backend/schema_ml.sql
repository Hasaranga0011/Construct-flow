-- ConstructFlow Machine Learning Dataset Schema
-- Run this script in your Supabase SQL Editor to create the ML dataset table

CREATE TABLE IF NOT EXISTS public.historical_costs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    square_footage NUMERIC NOT NULL,
    location TEXT NOT NULL,
    project_type TEXT NOT NULL,
    quality_tier TEXT NOT NULL,
    actual_cost NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Historical costs are internal training data and must stay manager scoped.
ALTER TABLE public.historical_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read historical_costs"
    ON public.historical_costs
    FOR SELECT TO authenticated
    USING (public.cf_role() IN ('super_admin', 'pm'));

CREATE POLICY "Admins insert historical_costs"
    ON public.historical_costs
    FOR INSERT TO authenticated
    WITH CHECK (public.cf_role() = 'super_admin');
