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

-- Enable Read Access for everyone (or adjust based on your security policies)
ALTER TABLE public.historical_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to historical_costs" 
    ON public.historical_costs
    FOR SELECT 
    USING (true);

CREATE POLICY "Allow insert access to historical_costs" 
    ON public.historical_costs
    FOR INSERT 
    WITH CHECK (true);
