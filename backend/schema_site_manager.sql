-- Site Manager Dashboard Tables

-- 1. Create the site_photos table
CREATE TABLE IF NOT EXISTS public.site_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    uploader_name TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the site_issues table
CREATE TABLE IF NOT EXISTS public.site_issues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    reporter_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High')),
    status TEXT NOT NULL CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optional: Insert mock data for testing (Requires at least one project to exist)
/*
INSERT INTO public.site_photos (project_id, uploader_name, photo_url, description)
SELECT 
  id, 
  'Site Manager', 
  'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=800', 
  'Foundation concrete pour progress'
FROM public.projects LIMIT 1;

INSERT INTO public.site_issues (project_id, reporter_name, title, description, severity, status)
SELECT 
  id, 
  'Site Manager', 
  'Water Leak on 2nd Floor', 
  'Found a minor water leak near the east stairwell. Needs plumbing team attention.', 
  'Medium', 
  'Open'
FROM public.projects LIMIT 1;
*/
