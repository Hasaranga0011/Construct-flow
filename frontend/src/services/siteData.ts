import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';

export function dataError(error: unknown, fallback = 'Unable to load site data. Please refresh.') {
  return typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}

export async function projectSites(projectIds: string[]) {
  if (!projectIds.length) return [];
  const result = await supabase.from('sites').select('id, project_id, site_manager_id').in('project_id', projectIds).order('id');
  if (result.error) throw result.error;
  const rows = result.data || [];
  for (const id of projectIds.filter(id => !rows.some(site => site.project_id === id))) {
    const prepared = await api.post(`/projects/${id}/attendance-setup`, {});
    rows.push(...prepared);
  }
  return rows;
}

// The deployed schema has no site_workers -> workers -> profiles FK chain.
// Resolve explicit IDs instead of relying on PostgREST relationship inference.
export async function assignedWorkers(projectIds: string[]) {
  if (!projectIds.length) return [];
  const assigned = await supabase.from('site_workers').select('id, project_id, worker_id').in('project_id', projectIds);
  if (assigned.error) throw assigned.error;
  const ids = [...new Set((assigned.data || []).map(a => a.worker_id))];
  if (!ids.length) return [];
  const [byId, byProfile] = await Promise.all([
    supabase.from('workers').select('id, user_id').in('id', ids),
    supabase.from('workers').select('id, user_id').in('user_id', ids),
  ]);
  if (byId.error) throw byId.error;
  if (byProfile.error) throw byProfile.error;
  let records = [...(byId.data || []), ...(byProfile.data || [])];
  const unresolved = (assigned.data || []).filter(a => !records.some(w => w.id === a.worker_id || w.user_id === a.worker_id));
  if (unresolved.length) {
    for (const id of [...new Set(unresolved.map(a => a.project_id))]) await api.post(`/projects/${id}/attendance-setup`, {});
    const repaired = await supabase.from('workers').select('id, user_id').in('id', ids);
    if (repaired.error) throw repaired.error;
    records = [...records, ...(repaired.data || [])];
  }
  const profileIds = [...new Set(records.map(w => w.user_id).filter(Boolean))];
  const profiles = profileIds.length ? await supabase.from('profiles').select('id, full_name, qr_code, avatar_url').in('id', profileIds) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  return (assigned.data || []).map(a => {
    const worker = records.find(w => w.id === a.worker_id) || records.find(w => w.user_id === a.worker_id);
    return { ...a, workerRecordId: worker?.id, profiles: profiles.data?.find(p => p.id === worker?.user_id) };
  });
}
