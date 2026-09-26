-- Final Fix: Create an RPC function that runs as SECURITY DEFINER (bypassing RLS)
-- This guarantees the role update will succeed regardless of schema cache or RLS caching issues.

CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text, new_worker_type text DEFAULT NULL, new_daily_rate numeric DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Ensure the caller is actually an admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(replace(role, ' ', '_')) IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can update roles';
  END IF;

  -- 2. Force the update directly on the profiles table
  UPDATE public.profiles 
  SET 
    role = new_role,
    worker_type = new_worker_type,
    daily_rate = new_daily_rate
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

-- Grant execute permission so the frontend can call it
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text, text, numeric) TO authenticated;
