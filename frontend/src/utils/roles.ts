export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  pm: 'Project Manager',
  site_manager: 'Site Manager',
  client: 'Client',
  supplier: 'Supplier',
  worker: 'Worker',
} as const;

export const roleLabel = (r?: string) => {
  if (!r) return '';
  const normalized = r.toLowerCase().replace(/ /g, '_') as keyof typeof ROLE_LABELS;
  return ROLE_LABELS[normalized] ?? r;
};
