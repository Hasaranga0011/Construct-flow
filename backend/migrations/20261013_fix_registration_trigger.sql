-- Migration: 20261013_fix_registration_trigger.sql
-- Fixes:
-- 1. Adds `is_approved` column to `public.profiles` if missing (which caused "Database error creating new user").
-- 2. Grants EXECUTE permissions on handle_new_user(), cf_guard_profile_role(), and cf_current_role()
--    to postgres, anon, authenticated, service_role, and supabase_auth_admin.
-- 3. Updates handle_new_user() trigger with defensive column handling and conflict resolution.
-- Run in Supabase SQL Editor as project owner.

BEGIN;

-- 1. Ensure `is_approved` column exists on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;

-- 2. Update existing supplier rows to approved so active suppliers are not locked out
UPDATE public.profiles
SET is_approved = TRUE
WHERE is_approved IS NULL;

-- 3. Replace handle_new_user function with robust role handling and verified column list
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
  -- Read role: prioritize raw_app_meta_data (server-set), fallback to raw_user_meta_data (signup-set)
  v_raw_role := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role'
  );

  IF v_raw_role IS NOT NULL THEN
    v_clean_role := lower(trim(replace(v_raw_role, ' ', '_')));
    IF v_clean_role IN ('super_admin', 'admin') THEN
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

-- 4. Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Grant permissions to all auth roles and admin users
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.cf_guard_profile_role() TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.cf_current_role() TO postgres, anon, authenticated, service_role, supabase_auth_admin;

NOTIFY pgrst, 'reload schema';

COMMIT;
