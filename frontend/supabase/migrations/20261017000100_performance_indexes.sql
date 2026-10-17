-- Migration: Add Performance Indexes for ConstructFlow
-- Dramatically accelerates relational lookups, foreign key joins, dashboard statistics, and search.

-- 1. Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_pm_id ON public.projects(pm_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- 2. Project Role Assignments
CREATE INDEX IF NOT EXISTS idx_project_roles_project ON public.project_role_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_user ON public.project_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_role ON public.project_role_assignments(role);
CREATE INDEX IF NOT EXISTS idx_project_roles_composite ON public.project_role_assignments(project_id, user_id, role);

-- 3. PM Projects & Site Manager Sites
CREATE INDEX IF NOT EXISTS idx_pm_projects_pm ON public.pm_projects(pm_id);
CREATE INDEX IF NOT EXISTS idx_pm_projects_proj ON public.pm_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_sm_sites_sm ON public.site_manager_sites(site_manager_id);
CREATE INDEX IF NOT EXISTS idx_sm_sites_proj ON public.site_manager_sites(project_id);
CREATE INDEX IF NOT EXISTS idx_site_workers_worker ON public.site_workers(worker_id);
CREATE INDEX IF NOT EXISTS idx_site_workers_proj ON public.site_workers(project_id);

-- 4. Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_site_date ON public.attendance(site_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_date ON public.attendance(worker_id, date DESC);

-- 5. Materials & Inventory
CREATE INDEX IF NOT EXISTS idx_materials_project ON public.materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_current_stock ON public.materials(current_stock);

-- 6. Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON public.purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON public.purchase_orders(created_at DESC);

-- 7. Milestones & Milestone Media
CREATE INDEX IF NOT EXISTS idx_milestones_project ON public.milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON public.milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON public.milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestone_media_milestone ON public.milestone_media(milestone_id);

-- 8. Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_target_user ON public.notifications(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON public.notifications(target_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- 9. Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 10. Project Expenses
CREATE INDEX IF NOT EXISTS idx_project_expenses_project ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_date ON public.project_expenses(expense_date DESC);
