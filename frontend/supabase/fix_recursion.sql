-- Fix for infinite recursion on profiles table

-- Drop the recursive admin_all policy from profiles
DROP POLICY IF EXISTS admin_all ON public.profiles;

-- Recreate a safe admin policy for profiles if needed, or rely on existing ones.
-- The safest way for an admin to view all profiles without recursion is to check the JWT claim 
-- (if role is in JWT) OR just use the existing profile policies you had before.

-- For safety, we'll allow users to read all profiles (typical for directory) 
-- and update their own, while Admins (via backend service role) can do everything.
-- If you strictly need RLS here:
CREATE POLICY profiles_read_all ON public.profiles
FOR SELECT USING (true);

-- (You likely already have policies for Insert/Update/Delete on profiles, so just dropping admin_all fixes the crash).
