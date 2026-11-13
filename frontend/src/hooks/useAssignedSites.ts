import { dataError } from '@/services/siteData';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type AssignedSiteInfo = {
  assignmentId: string; // ID from site_manager_sites
  projectId: string;    // ID from projects
};

type CachedAssignments = {
  assignedProjectIds: string[];
  siteAssignmentIds: string[];
  assignments: AssignedSiteInfo[];
  timestamp: number;
};

const ASSIGNMENTS_CACHE = new Map<string, CachedAssignments>();
const ASSIGNMENTS_TTL = 120_000; // 2 minutes

export function useAssignedSites(userId: string | undefined) {
  const initial = userId ? ASSIGNMENTS_CACHE.get(userId) : undefined;
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>(initial?.assignedProjectIds || []);
  const [siteAssignmentIds, setSiteAssignmentIds] = useState<string[]>(initial?.siteAssignmentIds || []);
  const [assignments, setAssignments] = useState<AssignedSiteInfo[]>(initial?.assignments || []);
  const [loading, setLoading] = useState(!initial);
  const requestVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async (force = false) => {
    const version = ++requestVersion.current;
    if (!userId) {
      setAssignedProjectIds([]); setSiteAssignmentIds([]); setAssignments([]); setError(null);
      setLoading(false);
      return;
    }

    const cached = ASSIGNMENTS_CACHE.get(userId);
    if (cached) {
      setAssignedProjectIds(cached.assignedProjectIds);
      setSiteAssignmentIds(cached.siteAssignmentIds);
      setAssignments(cached.assignments);
      setLoading(false);
      if (!force && Date.now() - cached.timestamp < ASSIGNMENTS_TTL) {
        return;
      }
    } else {
      setLoading(true);
    }
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

        ASSIGNMENTS_CACHE.set(userId, {
          assignedProjectIds: pIds,
          siteAssignmentIds: aIds,
          assignments: formatted,
          timestamp: Date.now(),
        });
        setAssignedProjectIds(pIds);
        setSiteAssignmentIds(aIds);
        setAssignments(formatted);
      }
    } catch (e) {
      if (version !== requestVersion.current) return;
      if (!cached) {
        setAssignedProjectIds([]); setSiteAssignmentIds([]); setAssignments([]);
      }
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
    refresh: () => fetchAssignments(true)
  };
}
