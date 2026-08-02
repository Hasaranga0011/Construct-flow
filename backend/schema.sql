-- ConstructFlow Database Schema
-- Run this script in your Supabase SQL Editor

-- 1. Create the projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Active', 'Planning', 'Completed', 'On Hold')),
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the materials table
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL, -- e.g., '120 bags'
    stock_level INTEGER NOT NULL CHECK (stock_level >= 0 AND stock_level <= 100),
    status TEXT NOT NULL CHECK (status IN ('In Stock', 'Low Stock', 'Out of Stock')),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: In a production environment, you would also set up Row Level Security (RLS) policies here.
