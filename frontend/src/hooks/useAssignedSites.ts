import { dataError } from '@/services/siteData';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type AssignedSiteInfo = {
  assignmentId: string; // ID from site_manager_sites
  projectId: string;    // ID from projects
};

export function useAssignedSites(userId: string | undefined) {
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [siteAssignmentIds, setSiteAssignmentIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<AssignedSiteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!userId) {
      setAssignedProjectIds([]); setSiteAssignmentIds([]); setAssignments([]); setError(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('site_manager_sites')
        .select('project_id, id')
        .eq('site_manager_id', userId);

      if (version !== requestVersion.current) return;
      if (error) {
        throw error;
      }

      if (data) {
        const pIds = data.map((a: any) => a.project_id);
        const aIds = data.map((a: any) => a.id);
        const formatted = data.map((a: any) => ({
          assignmentId: a.id,
          projectId: a.project_id
        }));

        setAssignedProjectIds(pIds);
        setSiteAssignmentIds(aIds);
        setAssignments(formatted);
      }
    } catch (e) {
      if (version !== requestVersion.current) return;
      setAssignedProjectIds([]); setSiteAssignmentIds([]); setAssignments([]);
      setError(dataError(e, 'Unable to load site assignments'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAssignments();
    const version = requestVersion.current;
    return () => { requestVersion.current = version + 1; };
  }, [fetchAssignments]);

  return {
    assignedProjectIds,
    siteAssignmentIds,
    assignments,
    loading,
    error,
    refresh: fetchAssignments
  };
}
