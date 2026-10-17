-- ============================================================================
-- ConstructFlow: Real Machine Learning & Historical Construction Data Tables
-- ============================================================================

-- 1. Historical Completed Projects Table (Real BOQ & Completed Project Records)
CREATE TABLE IF NOT EXISTS public.historical_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL, -- 'Residential House', 'Commercial Building', 'Apartment Complex', 'Industrial', etc.
    district TEXT NOT NULL,     -- One of the 25 Sri Lankan districts
    town TEXT,
    floor_area_sqft NUMERIC NOT NULL CHECK (floor_area_sqft > 0),
    floors INTEGER NOT NULL DEFAULT 1 CHECK (floors > 0),
    structure_type TEXT NOT NULL DEFAULT 'RCC frame', -- 'RCC frame', 'Load-bearing', 'Steel frame', etc.
    quality_tier TEXT NOT NULL DEFAULT 'Standard',    -- 'Standard', 'Premium', 'Luxury'
    site_condition TEXT NOT NULL DEFAULT 'Flat',     -- 'Flat', 'Sloped', 'Excavation/Piling'
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_project_start UNIQUE (project_name, start_date),
    CONSTRAINT end_after_start CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Ensure projects table has is_test flag to isolate test/mock projects
ALTER TABLE IF EXISTS public.projects ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_is_test ON public.projects(is_test);

-- One-time migration: Flag existing test projects for admin review
UPDATE public.projects
SET is_test = TRUE
WHERE (name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%sample%')
  AND is_test = FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_historical_district ON public.historical_projects(district);
CREATE INDEX IF NOT EXISTS idx_historical_type ON public.historical_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_historical_source ON public.historical_projects(source);
CREATE INDEX IF NOT EXISTS idx_historical_verified ON public.historical_projects(verified);
CREATE INDEX IF NOT EXISTS idx_historical_year ON public.historical_projects(cost_year);

-- 2. Material Prices Table (Aggregated from supplier-confirmed orders)
CREATE TABLE IF NOT EXISTS public.material_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'unit',
    unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
    supplier_name TEXT,
    district TEXT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    purchase_order_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_material_prices_material ON public.material_prices(material);
CREATE INDEX IF NOT EXISTS idx_material_prices_date ON public.material_prices(order_date);

-- 3. CIDA Price Indices Table (Bulletin of Construction Statistics)
CREATE TABLE IF NOT EXISTS public.price_indices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_group TEXT NOT NULL, -- 'Cement', 'Rebar Steel', 'Sand', 'Aggregate', 'Bricks', 'Timber', 'Labour', 'Overall Building'
    month VARCHAR(7) NOT NULL,    -- Format: 'YYYY-MM'
    index_value NUMERIC NOT NULL CHECK (index_value > 0),
    base_year INTEGER NOT NULL DEFAULT 2020,
    source TEXT DEFAULT 'CIDA Bulletin of Construction Statistics',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_group_month UNIQUE (material_group, month)
);

CREATE INDEX IF NOT EXISTS idx_price_indices_group_month ON public.price_indices(material_group, month);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.historical_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_indices ENABLE ROW LEVEL SECURITY;

-- Read policies: Any authenticated user can read historical benchmarks
DROP POLICY IF EXISTS "Authenticated users can read historical projects" ON public.historical_projects;
CREATE POLICY "Authenticated users can read historical projects" 
    ON public.historical_projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read material prices" ON public.material_prices;
CREATE POLICY "Authenticated users can read material prices" 
    ON public.material_prices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read price indices" ON public.price_indices;
CREATE POLICY "Authenticated users can read price indices" 
    ON public.price_indices FOR SELECT TO authenticated USING (true);

-- Write policies: Admins and service role can insert and update
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

DROP POLICY IF EXISTS "Admins can manage material prices" ON public.material_prices;
CREATE POLICY "Admins can manage material prices" 
    ON public.material_prices FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

DROP POLICY IF EXISTS "Admins can manage price indices" ON public.price_indices;
CREATE POLICY "Admins can manage price indices" 
    ON public.price_indices FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'super_admin')
        )
    );
