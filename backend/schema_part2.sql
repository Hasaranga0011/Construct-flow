-- ConstructFlow Database Schema Part 2
-- Run this script in your Supabase SQL Editor AFTER running schema.sql

-- 1. Create the labour table
CREATE TABLE IF NOT EXISTS public.labour (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    worker_name TEXT NOT NULL,
    role TEXT NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE,
    hours_worked NUMERIC(5,2) DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'On Leave')),
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the clients table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('Full Access', 'View Only', 'Financials Hidden')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create the estimations table (AI Estimates)
CREATE TABLE IF NOT EXISTS public.estimations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_name TEXT NOT NULL,
    estimated_cost NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Approved', 'Pending', 'Draft')),
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Alert', 'Info', 'Warning', 'Success')),
    is_unread BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
