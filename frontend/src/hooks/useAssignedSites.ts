import { useState, useEffect, useCallback } from 'react';
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

  const fetchAssignments = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_manager_sites')
        .select('project_id, id')
        .eq('site_manager_id', userId);

      if (error) {
        console.error('Error fetching assigned sites:', error);
        return;
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
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return {
    assignedProjectIds,
    siteAssignmentIds,
    assignments,
    loading,
    refresh: fetchAssignments
  };
}
