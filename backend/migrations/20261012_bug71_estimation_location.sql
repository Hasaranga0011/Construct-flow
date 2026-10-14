-- Migration: 20261012_bug71_estimation_location.sql
-- Description: Add district, town, latitude, longitude, and project_id to estimations,
-- with backfill from project_name and manual review listing.

-- 1. Add location columns to estimations table
ALTER TABLE public.estimations
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS town TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimations_district ON public.estimations (district);
CREATE INDEX IF NOT EXISTS idx_estimations_project_id ON public.estimations (project_id);

-- 2. Backfill district where existing free-text project_name matches a Sri Lankan district
UPDATE public.estimations
SET district = (
  CASE
    WHEN project_name ILIKE '%Colombo%' THEN 'Colombo'
    WHEN project_name ILIKE '%Gampaha%' THEN 'Gampaha'
    WHEN project_name ILIKE '%Kalutara%' THEN 'Kalutara'
    WHEN project_name ILIKE '%Kandy%' THEN 'Kandy'
    WHEN project_name ILIKE '%Matale%' THEN 'Matale'
    WHEN project_name ILIKE '%Nuwara Eliya%' THEN 'Nuwara Eliya'
    WHEN project_name ILIKE '%Galle%' THEN 'Galle'
    WHEN project_name ILIKE '%Matara%' THEN 'Matara'
    WHEN project_name ILIKE '%Hambantota%' THEN 'Hambantota'
    WHEN project_name ILIKE '%Jaffna%' THEN 'Jaffna'
    WHEN project_name ILIKE '%Kilinochchi%' THEN 'Kilinochchi'
    WHEN project_name ILIKE '%Mannar%' THEN 'Mannar'
    WHEN project_name ILIKE '%Vavuniya%' THEN 'Vavuniya'
    WHEN project_name ILIKE '%Mullaitivu%' THEN 'Mullaitivu'
    WHEN project_name ILIKE '%Batticaloa%' THEN 'Batticaloa'
    WHEN project_name ILIKE '%Ampara%' THEN 'Ampara'
    WHEN project_name ILIKE '%Trincomalee%' THEN 'Trincomalee'
    WHEN project_name ILIKE '%Kurunegala%' THEN 'Kurunegala'
    WHEN project_name ILIKE '%Puttalam%' THEN 'Puttalam'
    WHEN project_name ILIKE '%Anuradhapura%' THEN 'Anuradhapura'
    WHEN project_name ILIKE '%Polonnaruwa%' THEN 'Polonnaruwa'
    WHEN project_name ILIKE '%Badulla%' THEN 'Badulla'
    WHEN project_name ILIKE '%Monaragala%' THEN 'Monaragala'
    WHEN project_name ILIKE '%Ratnapura%' THEN 'Ratnapura'
    WHEN project_name ILIKE '%Kegalle%' THEN 'Kegalle'
    ELSE NULL
  END
)
WHERE district IS NULL;

-- 3. List unmatched estimations for manual review:
-- Run in Supabase SQL editor:
-- SELECT id, project_name, estimated_cost, created_at 
-- FROM public.estimations 
-- WHERE district IS NULL;
