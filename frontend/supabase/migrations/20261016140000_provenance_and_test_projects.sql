-- ============================================================================
-- Migration: Provenance, Verification, and Test Project Isolation
-- Timestamp: 20261016140000
-- ============================================================================

-- 1. Ensure projects table has is_test flag to isolate test/mock projects
ALTER TABLE IF EXISTS public.projects ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_is_test ON public.projects(is_test);

-- Flag existing test/demo/sample projects
UPDATE public.projects
SET is_test = TRUE
WHERE (name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%sample%')
  AND is_test = FALSE;

-- 2. Create historical_projects table if it does not exist yet
CREATE TABLE IF NOT EXISTS public.historical_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL DEFAULT 'Residential House',
    district TEXT NOT NULL DEFAULT 'Colombo',
    town TEXT,
    floor_area_sqft NUMERIC NOT NULL CHECK (floor_area_sqft > 0),
    floors INTEGER NOT NULL DEFAULT 1 CHECK (floors > 0),
    structure_type TEXT NOT NULL DEFAULT 'RCC frame',
    quality_tier TEXT NOT NULL DEFAULT 'Standard',
    site_condition TEXT NOT NULL DEFAULT 'Flat',
    start_date DATE,
    end_date DATE,
    estimate_total_lkr NUMERIC CHECK (estimate_total_lkr IS NULL OR estimate_total_lkr >= 0),
    actual_total_lkr NUMERIC NOT NULL CHECK (actual_total_lkr > 0),
    actual_materials_lkr NUMERIC DEFAULT 0 CHECK (actual_materials_lkr >= 0),
    actual_labour_lkr NUMERIC DEFAULT 0 CHECK (actual_labour_lkr >= 0),
    actual_equipment_lkr NUMERIC DEFAULT 0 CHECK (actual_equipment_lkr >= 0),
    actual_overhead_lkr NUMERIC DEFAULT 0 CHECK (actual_overhead_lkr >= 0),
    cost_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'real' CHECK (source IN ('real', 'imported_boq', 'sample')),
    imported_by TEXT,
    import_batch_id TEXT,
    evidence_note TEXT,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Ensure provenance & verification columns exist if table was already present
ALTER TABLE IF EXISTS public.historical_projects 
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS imported_by TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT TRUE;

-- Add check constraint for source if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_historical_source'
  ) THEN
    ALTER TABLE public.historical_projects
      ADD CONSTRAINT check_historical_source
      CHECK (source IN ('real', 'imported_boq', 'sample'));
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Indexes for performance, provenance and verification filtering
CREATE INDEX IF NOT EXISTS idx_historical_district ON public.historical_projects(district);
CREATE INDEX IF NOT EXISTS idx_historical_type ON public.historical_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_historical_source ON public.historical_projects(source);
CREATE INDEX IF NOT EXISTS idx_historical_verified ON public.historical_projects(verified);
CREATE INDEX IF NOT EXISTS idx_historical_year ON public.historical_projects(cost_year);

-- 4. Enable Row Level Security (RLS) on historical_projects
ALTER TABLE public.historical_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read historical projects" ON public.historical_projects;
CREATE POLICY "Authenticated users can read historical projects" 
    ON public.historical_projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage historical projects" ON public.historical_projects;
CREATE POLICY "Admins can manage historical projects" 
    ON public.historical_projects FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );
