-- ConstructFlow: Schema Consolidation
-- Resolves the split between 'labour' and 'attendance' tables.
-- Resolves the split between 'photos' / 'site_photos' / 'milestone_media'
--
-- This migration ensures the database relies on the canonical tables and renames
-- the deprecated legacy tables out of the way.

BEGIN;

-- 1. Labour vs Attendance
-- We chose 'attendance' as canonical because it has correct foreign keys to workers and sites.
-- Rename 'labour' to 'legacy_labour'.
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'labour') THEN
    ALTER TABLE public.labour RENAME TO legacy_labour;
  END IF;
END $$;

-- 2. Photos vs Site Photos vs Milestone Media
-- We chose 'site_reports' (which has a jsonb photos array) and 'milestone_media' as canonical
-- for storing images. The old 'photos' and 'site_photos' tables are deprecated.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'photos') THEN
    ALTER TABLE public.photos RENAME TO legacy_photos;
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'site_photos') THEN
    ALTER TABLE public.site_photos RENAME TO legacy_site_photos;
  END IF;
END $$;

COMMIT;
