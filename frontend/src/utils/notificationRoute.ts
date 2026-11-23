/** Only open links belonging to the signed-in user's portal. */
export function notificationRoute(link:string|null|undefined, role:string|null|undefined):string {
 const key=String(role||'').trim().toLowerCase().replace(/[ -]/g,'_');
 const portal=['admin','super_admin'].includes(key)?'admin':['pm','manager','project_manager'].includes(key)?'pm':key==='site_manager'?'site-manager':key;
 const base=['admin','pm','site-manager','worker','client','supplier'].includes(portal)?'/'+portal:'';
 const fallback=base?base+'/notifications':'/';
 if(!link||!base||/[\\\x00-\x1f]/.test(link)||/(^|\/)\.\.(\/|$)/.test(link)||/%2f|%5c|%2e/i.test(link))return fallback;
 return link.startsWith(base+'/')?link:fallback;
}
