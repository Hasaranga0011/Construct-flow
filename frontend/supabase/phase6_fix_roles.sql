-- Disable triggers so the SQL editor can update the rows without being blocked by RLS/trigger checks
ALTER TABLE public.profiles DISABLE TRIGGER USER;

-- Fix the profiles table so that all existing users have their roles synced from their registration metadata
UPDATE public.profiles p
SET role = COALESCE(
    (SELECT raw_user_meta_data->>'role' FROM auth.users u WHERE u.id = p.id),
    'client'
)
WHERE EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.raw_user_meta_data->>'role' IS NOT NULL
);

-- Re-enable triggers
ALTER TABLE public.profiles ENABLE TRIGGER USER;

-- Update the handle_new_user trigger to properly respect the role selected during registration
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email, role)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END
$$;

-- Drop the old overly-restrictive trigger that forced 'client' on profile insert
DROP TRIGGER IF EXISTS cf_profile_role_guard ON public.profiles;

-- Create a new trigger that allows initial role setting but prevents unauthorized updates
CREATE OR REPLACE FUNCTION public.cf_guard_profile_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.role() IS NULL OR public.cf_current_role() = 'super_admin' THEN
    RETURN NEW;
  END IF;
  
  -- If it's an insert, allow the role to be what handle_new_user set it to (or fallback to client)
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL THEN
        NEW.role := 'client';
    END IF;
  -- If it's an update, only allow admins to change the role
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only an administrator can change account roles' USING ERRCODE='42501';
  END IF;
  
  RETURN NEW;
END
$$;

CREATE TRIGGER cf_profile_role_guard 
BEFORE INSERT OR UPDATE ON public.profiles 
FOR EACH ROW EXECUTE PROCEDURE public.cf_guard_profile_role();
