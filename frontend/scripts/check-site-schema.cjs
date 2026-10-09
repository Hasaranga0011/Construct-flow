// Read-only schema contract probe. Does not read rows or mutate database state.
const fs = require('node:fs');
const path = require('node:path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const at = l.indexOf('='); return [l.slice(0, at).trim(), l.slice(at + 1).trim().replace(/^["']|["']$/g, '')]; }));
const checks = [
  ['site_manager_sites', 'id,project_id,site_manager_id'],
  ['sites', 'id,project_id,site_manager_id'],
  ['site_workers', 'id,project_id,worker_id'],
  ['workers', 'id,user_id'],
  ['profiles', 'id,full_name,qr_code,avatar_url'],
  ['attendance', 'id,worker_id,site_id,date,check_in_time,check_out_time,hours_worked'],
  ['issues', 'id,site_id,title,description,severity,status,reported_by,created_at'],
  ['milestones', '*,milestone_media(id,url)'],
  ['milestone_media', 'id,milestone_id,url,uploaded_by'],
  ['site_reports', 'id,project_id,date,work_completed,workers_present_count,blockers,photos,created_at'],
  ['materials', 'id,name,current_stock,minimum_threshold,project_id'],
  ['material_requests', '*,projects(name)'],
];
(async () => {
  let failures = 0;
  for (const [table, select] of checks) {
    const url = new URL(`/rest/v1/${table}`, env.EXPO_PUBLIC_SUPABASE_URL);
    url.searchParams.set('select', select); url.searchParams.set('limit', '0');
    const response = await fetch(url, { headers: { apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` } });
    if (response.ok) console.log('PASS', table);
    else { failures++; const error = await response.json(); console.log('FAIL', table, error.code, error.message); }
  }
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
