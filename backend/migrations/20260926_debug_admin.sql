-- Debugging Admin Permissions
-- Run this in your Supabase SQL Editor to see exactly how the database sees your Admin user.

-- 1. Check your users and their roles
SELECT id, email, role, public.cf_is_admin() as is_admin 
FROM public.profiles 
WHERE email = 'admin@gmail.com' OR role = 'admin' OR role = 'super_admin';

-- 2. Force the schema cache to reload (REQUIRED after any GRANT command)
NOTIFY pgrst, 'reload schema';

-- 3. Directly test the update (Replace with a real user ID from your database)
-- UPDATE public.profiles SET role = 'worker' WHERE email = 'testworker@gmail.com' RETURNING *;
