export const normalizeRole = (value?: string | null): string | null => {
  if (!value) return null;

  const cleaned = value.trim();
  const normalized = cleaned.toLowerCase().replace(/\s+/g, '_');

  const roleMap: Record<string, string> = {
    admin: 'admin',
    super_admin: 'admin',
    'super admin': 'admin',
    superadmin: 'admin',
    pm: 'pm',
    manager: 'pm',
    project_manager: 'pm',
    'project manager': 'pm',
    site_manager: 'site_manager',
    'site manager': 'site_manager',
    sitemanager: 'site_manager',
    client: 'client',
    worker: 'worker',
    supplier: 'supplier',
  };

  return roleMap[normalized] ?? normalized;
};

export const getDashboardForRole = (value?: string | null): string | null => {
  const normalized = normalizeRole(value);

  if (!normalized) return null;

  const dashboardMap: Record<string, string> = {
    admin: '/admin/dashboard',
    pm: '/pm/dashboard',
    site_manager: '/site-manager/dashboard',
    client: '/client/dashboard',
    worker: '/worker/dashboard',
    supplier: '/supplier/dashboard',
  };

  return dashboardMap[normalized] ?? null;
};
