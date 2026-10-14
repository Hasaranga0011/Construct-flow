-- Migration: 20261012_bugs_68_69_phone_roles.sql
-- Fixes:
-- 1. Bug 68: Phone number normalization, check constraint (^\+94[1-9][0-9]{8}$)
-- 2. Bug 69: Fix handle_new_user to use validated metadata role, eliminate silent client fallback (default to 'pending'),
--    and ensure cf_guard_profile_role does not force 'client' on insert.

BEGIN;

-- ============================================================================
-- 1. BUG 68: NORMALIZE EXISTING PHONE NUMBERS & ADD CHECK CONSTRAINT
-- ============================================================================

-- Log any phone numbers that cannot be normalized (for manual administrative fixing)
DO $$
DECLARE
  unparseable_record RECORD;
BEGIN
  FOR unparseable_record IN
    SELECT id, email, contact_number 
    FROM public.profiles 
    WHERE contact_number IS NOT NULL 
      AND contact_number != ''
      AND NOT (
        contact_number ~ '^\+94[1-9][0-9]{8}$'
        OR regexp_replace(contact_number, '[\s\-\(\)\.]', '', 'g') ~ '^(0094|94|0)?[1-9][0-9]{8}$'
        OR regexp_replace(contact_number, '[\s\-\(\)\.]', '', 'g') ~ '^[1-9][0-9]{8}$'
      )
  LOOP
    RAISE NOTICE 'Notice: Phone number on profile % (email: %) cannot be normalized: %', 
      unparseable_record.id, unparseable_record.email, unparseable_record.contact_number;
  END LOOP;
END $$;

-- Normalize existing values:
-- Step a: strip whitespace and formatting punctuation
UPDATE public.profiles
SET contact_number = regexp_replace(contact_number, '[\s\-\(\)\.]', '', 'g')
WHERE contact_number IS NOT NULL AND contact_number != '';

-- Step b: 0094XXXXXXXXX -> +94XXXXXXXXX
UPDATE public.profiles
SET contact_number = '+94' || substring(contact_number from 5)
WHERE contact_number LIKE '0094%' AND length(contact_number) = 13;

-- Step c: 94XXXXXXXXX (11 chars) -> +94XXXXXXXXX
UPDATE public.profiles
SET contact_number = '+' || contact_number
WHERE contact_number ~ '^94[1-9][0-9]{8}$';

-- Step d: 0XXXXXXXXX (10 chars) -> +94XXXXXXXXX
UPDATE public.profiles
SET contact_number = '+94' || substring(contact_number from 2)
WHERE contact_number ~ '^0[1-9][0-9]{8}$';

-- Step e: XXXXXXXXX (9 chars) -> +94XXXXXXXXX
UPDATE public.profiles
SET contact_number = '+94' || contact_number
WHERE contact_number ~ '^[1-9][0-9]{8}$';

-- Drop constraint if exists, then add constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_valid_lk_phone;

-- Note: We enforce constraint on all valid/null records; if any unnormalized string remains, we allow it temporarily or enforce regex
DO $$
BEGIN
  -- Test if any remaining values fail the regex
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE contact_number IS NOT NULL 
      AND contact_number != ''
      AND contact_number !~ '^\+94[1-9][0-9]{8}$'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT check_valid_lk_phone 
      CHECK (contact_number IS NULL OR contact_number = '' OR contact_number ~ '^\+94[1-9][0-9]{8}$');
  END IF;
END $$;

-- Ensure authenticated users can update contact_number
GRANT UPDATE (contact_number) ON public.profiles TO authenticated;


-- ============================================================================
-- 2. BUG 69: FIX handle_new_user TRIGGER & cf_guard_profile_role
-- ============================================================================

-- Update handle_new_user trigger to extract role strictly from app_metadata or user_metadata,
-- normalize it, and explicitly use 'pending' if missing or unrecognized (NEVER default to 'client').
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_raw_role text;
  v_clean_role text;
  v_role text := 'pending';
  v_full_name text;
  v_contact text;
  v_approved boolean := true;
BEGIN
  -- 1. Read role: prioritize raw_app_meta_data (server-set), fallback to raw_user_meta_data (signup-set)
  v_raw_role := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role'
  );

  IF v_raw_role IS NOT NULL THEN
    v_clean_role := lower(trim(replace(v_raw_role, ' ', '_')));
    IF v_clean_role IN ('super_admin', 'admin') THEN
      -- If set via raw_app_meta_data, admin is allowed; if public signup tried setting admin, reject to pending
      IF NEW.raw_app_meta_data->>'role' IN ('super_admin', 'admin') THEN
        v_role := 'super_admin';
      ELSE
        v_role := 'pending';
      END IF;
    ELSIF v_clean_role IN ('pm', 'project_manager', 'manager') THEN
      v_role := 'pm';
    ELSIF v_clean_role IN ('site_manager', 'sitemanager') THEN
      v_role := 'site_manager';
    ELSIF v_clean_role = 'worker' THEN
      v_role := 'worker';
    ELSIF v_clean_role = 'client' THEN
      v_role := 'client';
    ELSIF v_clean_role = 'supplier' THEN
      v_role := 'supplier';
      v_approved := false; -- Suppliers require admin approval
    ELSE
      v_role := 'pending';
    END IF;
  ELSE
    v_role := 'pending';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_contact := NEW.raw_user_meta_data->>'contact_number';
  IF v_contact IS NOT NULL THEN
    v_contact := regexp_replace(v_contact, '[\s\-\(\)\.]', '', 'g');
    IF v_contact ~ '^0[1-9][0-9]{8}$' THEN
      v_contact := '+94' || substring(v_contact from 2);
    ELSIF v_contact ~ '^[1-9][0-9]{8}$' THEN
      v_contact := '+94' || v_contact;
    ELSIF v_contact !~ '^\+94[1-9][0-9]{8}$' THEN
      v_contact := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles(id, full_name, email, role, contact_number, is_approved)
  VALUES (NEW.id, v_full_name, NEW.email, v_role, v_contact, v_approved)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = CASE WHEN public.profiles.role IS NULL OR public.profiles.role = 'pending' THEN EXCLUDED.role ELSE public.profiles.role END,
    contact_number = COALESCE(EXCLUDED.contact_number, public.profiles.contact_number),
    is_approved = EXCLUDED.is_approved;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Update profile guard: Allow INSERT with whatever role was set by handle_new_user/admin
-- Never force 'client' on insert!
CREATE OR REPLACE FUNCTION public.cf_guard_profile_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Service role, background scripts, or super_admin can do anything
  IF auth.role() = 'service_role' OR auth.role() IS NULL OR public.cf_current_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- If role is not provided, set to 'pending' (never silently 'client')
    IF NEW.role IS NULL OR NEW.role = '' THEN
      NEW.role := 'pending';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only admin can change role
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only an administrator can change account roles' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cf_guard_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cf_guard_profile_role() TO service_role, authenticated;

DROP TRIGGER IF EXISTS cf_profile_role_guard ON public.profiles;
CREATE TRIGGER cf_profile_role_guard
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.cf_guard_profile_role();

NOTIFY pgrst, 'reload schema';

COMMIT;
