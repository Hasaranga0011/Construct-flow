-- All new email, username and OAuth accounts require administrator approval.
-- Existing account approvals are not changed.
BEGIN;
ALTER TABLE public.profiles ALTER COLUMN is_approved SET DEFAULT false;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_raw_role text;
  v_clean_role text;
  v_role text := 'pending';
  v_full_name text;
  v_contact text;
  v_approved boolean := false;
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
      v_approved := false;
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
    is_approved = public.profiles.is_approved;

  RETURN NEW;
END;
$$;


COMMIT;

