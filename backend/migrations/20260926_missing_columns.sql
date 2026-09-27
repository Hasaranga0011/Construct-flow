ALTER TABLE IF EXISTS public.client_messages ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''; ALTER TABLE IF EXISTS public.purchase_orders ADD COLUMN IF NOT EXISTS actual_delivery DATE; ALTER TABLE IF EXISTS public.shared_documents ADD COLUMN IF NOT EXISTS name TEXT; ALTER TABLE IF EXISTS public.shared_documents ADD COLUMN IF NOT EXISTS category TEXT; ALTER TABLE IF EXISTS public.shared_documents ADD COLUMN IF NOT EXISTS status TEXT; ALTER TABLE IF EXISTS public.shared_documents ADD COLUMN IF NOT EXISTS file_name TEXT; ALTER TABLE IF EXISTS public.shared_documents ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS project_id UUID; ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS target_role TEXT; ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS target_user_id UUID;
ALTER TABLE IF EXISTS public.client_messages ADD COLUMN IF NOT EXISTS content TEXT;
DROP POLICY IF EXISTS cf_projects_delete ON public.projects;
CREATE POLICY cf_projects_delete ON public.projects FOR DELETE TO authenticated
USING (public.cf_is_admin() OR public.cf_role() IN ('pm', 'site_manager'));
