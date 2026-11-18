const PORTALS: Record<string, string> = {
  admin: 'Admin', pm: 'Project Manager', 'site-manager': 'Site Manager',
  client: 'Client', supplier: 'Supplier', worker: 'Worker',
};

const PUBLIC: Record<string, string> = {
  '': 'Construction Management', login: 'Sign In', register: 'Create Account',
  'admin-login': 'Admin Login', 'team-login': 'Team Login', 'team-register': 'Team Registration',
  'partner-login': 'Partner Login', 'partner-register': 'Partner Registration',
  'forgot-password': 'Forgot Password', 'reset-password': 'Reset Password',
  'pending-approval': 'Account Approval', '+not-found': 'Page Not Found', '_sitemap': 'Site Map',
};

const PAGES: Record<string, string> = {
  '': 'Dashboard', dashboard: 'Dashboard', projects: 'Projects', project: 'My Projects',
  'projects/create': 'New Project', 'projects/:id': 'Project Overview', 'projects/:id/edit': 'Edit Project',
  'projects/:id/boq': 'Project BOQ', 'project/:id/boq': 'Project BOQ',
  'projects/:id/milestones': 'Project Milestones', 'projects/:id/milestones/create': 'New Milestone',
  'projects/:id/milestones/:id': 'Milestone Details', 'project/milestones': 'Project Milestones',
  'project/milestones/:id': 'Milestone Details', 'project/:id/reports': 'Site Reports',
  'projects/:id/reports': 'Site Reports', 'projects/:id/issues': 'Project Issues',
  'projects/:id/documents': 'Project Documents', 'projects/:id/commercial': 'Payments & Variations',
  'projects/:id/expenses': 'Project Expenses', 'projects/:id/expenses/create': 'New Expense',
  'project/map': 'Project Map', 'project/estimates': 'Project Estimates',
  materials: 'Materials', 'materials/create': 'New Material', 'materials/:id': 'Material Details',
  'materials/stock': 'Material Stock', 'materials/stock/:id': 'Site Stock',
  'materials/orders': 'Purchase Orders', 'materials/orders/create': 'New Purchase Order',
  'materials/orders/:id': 'Purchase Order Details',
  orders: 'My Orders', 'orders/:id': 'Order Details', 'orders/history': 'Order History', deliveries: 'Deliveries',
  users: 'User Directory', 'users/create': 'New User', 'users/:id': 'User Details', 'users/:id/edit': 'Edit User',
  'users/workers': 'Workers', 'users/suppliers': 'Suppliers', 'users/clients': 'Clients',
  'users/pms': 'Project Managers', 'users/site-managers': 'Site Managers',
  labour: 'Labour & Attendance', attendance: 'Attendance', 'attendance/:id': 'Project Attendance',
  'attendance/sites/:id': 'Site Attendance', payroll: 'Payroll', 'payroll/generate': 'Generate Payroll',
  'payroll/:id': 'Worker Payroll', 'salary/:id': 'Salary Slip',
  client: 'Clients', suppliers: 'Suppliers', 'suppliers/create': 'New Supplier',
  'suppliers/:id': 'Supplier Details', 'suppliers/:id/orders': 'Supplier Orders',
  team: 'Team', 'team/:id': 'Team Member', messages: 'Messages', 'messages/:id': 'Conversation',
  notifications: 'Notifications', profile: 'My Profile', settings: 'Settings',
  estimator: 'AI Estimator', 'ai-estimator': 'AI Estimator', insights: 'ML Insights',
  reports: 'Reports', 'reports/create': 'New Site Report', 'reports/projects': 'Project Reports',
  'reports/materials': 'Material Reports', 'reports/payroll': 'Payroll Reports',
  issues: 'Issues', documents: 'Documents', financials: 'Payments & Variations', invoices: 'Invoices',
  media: 'Site Media & Gallery', milestones: 'Milestones', sites: 'Assigned Sites', site: 'My Site',
};

const OVERRIDES: Record<string, string> = {
  'pm/labour': 'Project Labour', 'pm/projects/:id/expenses': 'Budget & Procurement',
  'worker/payroll': 'My Payroll', 'worker/attendance': 'My Attendance',
  'site-manager/reports': 'Site Reports', 'site-manager/materials': 'Site Materials',
};
const STATIC_SEGMENTS = new Set(Object.keys(PAGES).flatMap(key => key.split('/')).filter(key => key !== ':id'));

/** Only known route labels enter titles: never expose IDs, query strings or recovery tokens. */
export function pageMetadata(pathname: string) {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  const portal = segments[0] || '';
  if (!PORTALS[portal]) {
    const heading = PUBLIC[segments.join('/')] || 'Page Not Found';
    return { heading, title: segments.length ? `${heading} | ConstructAi` : 'ConstructAi | Construction Management' };
  }
  const key = segments.slice(1).map(segment => STATIC_SEGMENTS.has(segment) ? segment : ':id').join('/');
  const heading = OVERRIDES[`${portal}/${key}`] || PAGES[key] || 'Page Not Found';
  return { heading, title: `${heading} | ${PORTALS[portal]} | ConstructAi` };
}
