/** Reading widths for portal content, independent of screen size and sidebar. */
export function isDashboardPath(path: string): boolean {
  return /^\/(admin|pm|site-manager|supplier|client|worker)(\/dashboard)?\/?$/.test(path);
}

export function contentWidth(path: string): number | undefined {
  if (isDashboardPath(path)) return;
  const parts = path.split('/').filter(Boolean);
  if (!['admin', 'pm', 'site-manager', 'supplier', 'client', 'worker'].includes(parts[0])) return;
  const page = parts.slice(1).join('/');
  if (/(^|\/)(profile|settings|create|edit|generate|site)(\/|$)/.test(page)) return 920;
  if (parts[0] === 'worker' || /^(notifications|messages)(\/|$)/.test(page)) return 1040;
  if (/^(projects|project)\/[^/]+/.test(page)) return 1160;
  return 1280;
}
