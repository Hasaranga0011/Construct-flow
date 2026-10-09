import { supabase } from '../lib/supabase';
import { assignedWorkers } from './siteData';

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
  
  const assigned = await assignedWorkers(projects.map(p => p.id));
  const workerIds = [...new Set(assigned.map(a => a.profiles?.id).filter(Boolean))];
  if (!workerIds.length) return [];
  
  const result = await supabase.from('salary_slips').select('*').in('worker_id', workerIds).order('created_at', { ascending: false });
  if (result.error) throw result.error;
  const slips = result.data || [];
  
  return slips.map(slip => {
    const assign = assigned.find(a => a.profiles?.id === slip.worker_id);
    return { 
      ...slip, 
      worker: assign?.profiles, 
      project: projects.find(p => p.id === assign?.project_id) 
    };
  });
}
