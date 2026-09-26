-- Remove the historical recursive profile policy without opening the directory.
DROP POLICY IF EXISTS admin_all ON public.profiles;

-- The canonical non-recursive profile policies are installed by
-- backend/migrations/20260925_harden_core_rls.sql.
