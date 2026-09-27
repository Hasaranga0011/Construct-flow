-- ConstructFlow: Supplier Approval Gate
-- Run in Supabase SQL Editor as project owner.
-- Adds is_approved to profiles (supplier-only gate) and creates the admin
-- approval RPC so admins can approve/reject suppliers without needing service-role.

BEGIN;

-- ----------------------------------------------------------------
-- 1. Add is_approved to profiles
-- ----------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;

-- Suppliers start unapproved; all other roles default to approved.
-- Set existing supplier rows to approved so we don't break live data.
UPDATE public.profiles
SET is_approved = TRUE
WHERE role = 'supplier' AND is_approved IS NULL;

-- New supplier registrations will be set to false by the trigger below.
CREATE OR REPLACE FUNCTION public.handle_new_supplier()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'supplier' THEN
    NEW.is_approved := FALSE;
  ELSE
    NEW.is_approved := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_supplier_insert ON public.profiles;
CREATE TRIGGER on_supplier_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_supplier();

-- ----------------------------------------------------------------
-- 2. RPC: admin_approve_supplier — flips is_approved = true
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_supplier(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Caller must be super_admin
  SELECT role INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only admins can approve suppliers';
  END IF;

  UPDATE public.profiles
  SET is_approved = TRUE
  WHERE id = p_user_id AND role = 'supplier';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier user % not found', p_user_id;
  END IF;

  RETURN json_build_object('approved', TRUE, 'user_id', p_user_id);
END;
$$;

-- ----------------------------------------------------------------
-- 3. RPC: admin_set_user_role — safe role update without privilege escalation
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_role TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_role TEXT;
  allowed_roles TEXT[] := ARRAY['super_admin','pm','site_manager','worker','client','supplier'];
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF p_role <> ALL(allowed_roles) THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  -- Auto-approve non-suppliers on role change
  IF p_role <> 'supplier' THEN
    UPDATE public.profiles SET is_approved = TRUE WHERE id = p_user_id;
  END IF;

  RETURN json_build_object('ok', TRUE, 'user_id', p_user_id, 'new_role', p_role);
END;
$$;

-- ----------------------------------------------------------------
-- 4. RLS: Admins can view & update all profiles for user management
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.cf_role() = 'super_admin')
  WITH CHECK (public.cf_role() = 'super_admin');

-- ----------------------------------------------------------------
-- 5. Block unapproved suppliers from appearing in purchase order supplier list
-- The existing RLS on purchase_orders already scopes per-role; this adds a
-- read-time guard on profiles for the supplier picker.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "PM sees only approved suppliers" ON public.profiles;
CREATE POLICY "PM sees only approved suppliers"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- A PM can only see supplier profiles that are approved
    CASE
      WHEN public.cf_role() = 'pm' AND role = 'supplier'
        THEN is_approved = TRUE
      ELSE TRUE
    END
  );

COMMIT;
