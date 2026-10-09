import { supabase } from '../lib/supabase';

export async function managedProjects() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const result = await supabase.from('projects').select('*').eq('pm_id', session.user.id);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function managedPayroll() {
  const projects = await managedProjects();
  if (!projects.length) return [];
  const result = await supabase.from('salary_slips').select('*').in('site_id', projects.map(p => p.id)).order('created_at', { ascending: false });
  if (result.error) throw result.error;
  const slips = result.data || [];
  const ids = [...new Set(slips.map(s => s.worker_id).filter(Boolean))];
  if (!ids.length) return [];
  const people = await supabase.from('profiles').select('id, full_name, contact_number').in('id', ids);
  if (people.error) throw people.error;
  return slips.map(slip => ({ ...slip, worker: people.data?.find(p => p.id === slip.worker_id), project: projects.find(p => p.id === slip.site_id) }));
}
