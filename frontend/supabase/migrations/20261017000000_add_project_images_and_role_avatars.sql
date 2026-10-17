-- ============================================================================
-- Migration: Add Project Images and Role Profile Avatar Defaults
-- Timestamp: 20261017000000
-- ============================================================================

-- 1. Ensure projects table has image_url and images columns
ALTER TABLE IF EXISTS public.projects ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE IF EXISTS public.projects ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 2. Populate projects with high-resolution curated architectural & construction images
UPDATE public.projects
SET image_url = CASE
  -- Luxury Villas (Kurunegala, Colombo, Gampaha, Galle, Negombo, Kandy, Nugegoda, Hambantota)
  WHEN name ILIKE '%Luxury Villa - Kurunegala%' THEN 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Colombo%' THEN 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Gampaha%' THEN 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Galle%' THEN 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Negombo%' THEN 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Kandy%' THEN 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Luxury Villa - Nugegoda%' THEN 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Villa%' THEN 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80'
  
  -- Commercial Complexes (Colombo, Negombo, Galle, Gampaha, Kandy, Nugegoda)
  WHEN name ILIKE '%Commercial Complex - Colombo%' THEN 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Commercial Complex - Negombo%' THEN 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Commercial Complex - Galle%' THEN 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Commercial Complex - Gampaha%' THEN 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Commercial Complex - Kandy%' THEN 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Commercial Complex%' THEN 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80'

  -- Towers, City Centers, Special Projects
  WHEN name ILIKE '%Lotus Tower%' THEN 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Galle City Center%' THEN 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Enrich Arcane%' THEN 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Moon Plains%' THEN 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Hotel%' THEN 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%College%' OR name ILIKE '%KDU%' OR name ILIKE '%ATI%' THEN 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Tiles%' OR name ILIKE '%Building%' THEN 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=800&auto=format&fit=crop&q=80'
  WHEN name ILIKE '%Residential%' THEN 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80'
  
  -- Default high-grade construction project hero image
  ELSE 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=800&auto=format&fit=crop&q=80'
END
WHERE image_url IS NULL OR image_url = '';

-- 3. Ensure profiles table has default role avatar fallback trigger for newly created users
CREATE OR REPLACE FUNCTION public.set_default_role_avatar()
RETURNS trigger AS $$
BEGIN
  IF NEW.avatar_url IS NULL OR NEW.avatar_url = '' THEN
    NEW.avatar_url := CASE
      WHEN NEW.role IN ('admin', 'super_admin', 'Admin', 'Super Admin') THEN 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'
      WHEN NEW.role IN ('pm', 'project_manager', 'PM', 'Project Manager') THEN 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80'
      WHEN NEW.role IN ('site_manager', 'Site Manager', 'site manager') THEN 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&auto=format&fit=crop&q=80'
      WHEN NEW.role IN ('worker', 'Worker') THEN 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&auto=format&fit=crop&q=80'
      WHEN NEW.role IN ('client', 'Client') THEN 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&auto=format&fit=crop&q=80'
      WHEN NEW.role IN ('supplier', 'Supplier') THEN 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&auto=format&fit=crop&q=80'
      ELSE 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_default_role_avatar ON public.profiles;
CREATE TRIGGER trg_set_default_role_avatar
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_role_avatar();
