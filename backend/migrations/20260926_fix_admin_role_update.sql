-- Fix Bug 1: Grant column update permissions so Admins can save role changes
-- The previous core_rls migration revoked UPDATE on public.profiles and only 
-- granted it on 'safe' columns. Since 'role', 'worker_type', and 'daily_rate'
-- were omitted, PostgREST silently dropped them from the UPDATE payload, 
-- causing the frontend to report success with 0 rows affected or without actually saving.
GRANT UPDATE (role, worker_type, daily_rate) ON public.profiles TO authenticated;

-- Also, force the Schema Cache to reload so PostgREST immediately picks up the new permissions.
NOTIFY pgrst, 'reload schema';

-- Replace the RLS policy to ensure there is no SECURITY DEFINER function context dropping the role check.
DROP POLICY IF EXISTS cf_profiles_update ON public.profiles;

CREATE POLICY cf_profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (
  id = auth.uid() 
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(replace(role, ' ', '_')) IN ('admin', 'super_admin'))
)
WITH CHECK (
  id = auth.uid() 
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(replace(role, ' ', '_')) IN ('admin', 'super_admin'))
);
