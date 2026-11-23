import { useTableSort } from '@/hooks/useTableSort';
import { TableSortControl } from '@/components/common/SortableHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { EditProjectModal } from './EditProjectModal';
import { useDebounce } from '../../hooks/useDebounce';

import { useTableLayout } from '@/hooks/useTableLayout';
import { ProjectImage } from '../common/ProjectImage';
import { Button } from '@/components/ui';
import { progressDisplay } from '@/utils/statusDisplay';

const PROJECT_COLUMNS={status:120,progress:112,action:96};

const ProjectRow = ({ project, onManage, isMobile }: { project: any, onManage: (p: any) => void; isMobile:boolean }) => {
  const { name, location, status } = project;
  const progress=progressDisplay(project.completion_percentage);

  if (isMobile) {
    return (
      <View testID="active-project-row" className="flex-col py-4 border-b border-gray-100 w-full min-w-0">
        <View className="flex-row justify-between items-start mb-2 w-full">
          <View className="flex-row items-center flex-1 pr-2">
            <ProjectImage
              project={project}
              className="w-12 h-12 rounded-lg mr-3 shadow-sm shrink-0"
            />
            <View className="flex-1 min-w-0">
              <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 font-bold text-sm">{name}</Text>
              <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="text-slate-500 dark:text-slate-400 text-xs mt-1">{location}</Text>
            </View>
          </View>
        </View>
        <View className="w-full mb-3 flex-row items-center gap-3">
          <View testID="project-status-cell" style={{width:PROJECT_COLUMNS.status,flexShrink:0}}><StatusBadge fullWidth status={status} /></View>
          <View className="flex-1 min-w-0">
          <View className="flex-row justify-between mb-1">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-slate-500 dark:text-slate-400 text-xs">Progress</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-xs font-bold">{progress}%</Text>
          </View>
          <View className="h-1.5 bg-gray-100 rounded-full w-full overflow-hidden">
            <View className="h-full bg-brand-orange rounded-full" style={{ width: `${progress}%` }} />
          </View>
          </View>
        </View>
        <Button label="Manage" accessibilityLabel={`Manage ${name}`} variant="secondary" size="compact" className="w-full" style={{alignSelf:'stretch'}} onPress={()=>onManage(project)}/>
      </View>
    );
  }

  return (
    <View testID="active-project-row" className="flex-row items-center py-4 border-b border-gray-100 min-w-0">
      {/* Thumbnail */}
      <ProjectImage
        project={project}
        className="w-12 h-12 rounded-lg mr-4 shadow-sm shrink-0"
      />

      {/* Details */}
      <View testID="project-details-cell" className="flex-1 min-w-0 justify-center pr-4">
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 font-semibold text-sm">{name}</Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="text-slate-500 dark:text-slate-400 text-xs mt-1">{location}</Text>
      </View>

      {/* Status Badge */}
      <View testID="project-status-cell" style={{width:PROJECT_COLUMNS.status,flexShrink:0}} className="mr-4"><StatusBadge fullWidth status={status} /></View>

      {/* Progress */}
      <View testID="project-progress-cell" style={{width:PROJECT_COLUMNS.progress,flexShrink:0}} className="flex-row items-center mr-4 gap-2">
        <Text style={{fontVariant:['tabular-nums']}} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 font-bold text-sm w-11 text-right">{progress}%</Text>
        <View className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-brand-orange rounded-full"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>

      {/* Manage Button */}
      <View testID="project-action-cell" style={{width:PROJECT_COLUMNS.action,flexShrink:0}}><Button label="Manage" accessibilityLabel={`Manage ${name}`} variant="secondary" size="compact" className="w-full" onPress={()=>onManage(project)}/></View>
    </View>
  );
};

export const ActiveProjectsTable = ({ refreshTrigger = 0, searchQuery = '', pmId }: { refreshTrigger?: number, searchQuery?: string, pmId?: string }) => {
  const router = useRouter();
  const { isCompact:isMobile, onLayout } = useTableLayout(780);
  const tableSort = useTableSort({"Project":r=>r.name,"Location":r=>r.location,"Status":r=>r.status,"Progress":r=>r.completion_percentage});
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    let isMounted = true;

    const loadProjects = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        let query = supabase
          .from('projects')
          .select('id, name, location, status, image_url, images, start_date, end_date, total_budget, spent_cost, completion_percentage, pm_id, client_id, created_at')
          .in('status', ['active', 'Active', 'In Progress', 'in progress'])
          .order('created_at', { ascending: false });

        if (pmId) {
          query = query.eq('pm_id', pmId);
        }

        const { data: projectsData, error } = await query;
        if (error) throw error;

        let finalProjects = projectsData || [];

        // Fetch milestones to calculate progress
        if (finalProjects.length > 0) {
           const projectIds = finalProjects.map(p => p.id);
           const { data: milestonesData } = await supabase
             .from('milestones')
             .select('project_id, completion_percentage')
             .in('project_id', projectIds);

           if (milestonesData) {
             const milsByProj: Record<string, number[]> = {};
             milestonesData.forEach(m => {
               if (!m.project_id) return;
               if (!milsByProj[m.project_id]) milsByProj[m.project_id] = [];
               milsByProj[m.project_id].push(m.completion_percentage || 0);
             });
             finalProjects = finalProjects.map(p => {
               const pMils = p.id ? milsByProj[p.id] : undefined;
               if (!pMils || pMils.length === 0) return p;
               const total = pMils.reduce((sum: number, val: number) => sum + val, 0);
               return { ...p, completion_percentage: Math.round(total / pMils.length) };
             });
           }
        }

        if (isMounted) setProjects(finalProjects);
      } catch (error) {
        console.warn('Failed to load projects:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProjects();

    return () => { isMounted = false; };
  }, [refreshTrigger, localRefresh, pmId]);

  const filteredProjects = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p => `${p.name || ''} ${p.location || ''}`.toLowerCase().includes(q));
  }, [projects, debouncedSearchQuery]);

  const handleManage = (project: any) => {
    setSelectedProject(project);
    setShowEditModal(true);
  };

  return (
    <View onLayout={onLayout} className={`bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 dark:border-slate-700 ${isMobile ? '' : 'flex-1 min-h-[300px]'}`}>
      <TableSortControl sort={tableSort}/>
      <View className="flex-row justify-between items-center mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-slate-100">Active Projects</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(pmId ? '/pm/projects' : '/admin/projects')}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">View all →</Text>
        </Pressable>
      </View>

      <View className={isMobile ? "w-full" : "flex-1"}>
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : filteredProjects.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No active projects found.</Text>
          </View>
        ) : (
          tableSort.sort(filteredProjects).map(p => (
            <ProjectRow isMobile={isMobile}
              key={p.id}
              project={p}
              onManage={handleManage}
            />
          ))
        )}
      </View>

      <EditProjectModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        project={selectedProject}
        onProjectUpdated={() => setLocalRefresh(prev => prev + 1)}
      />
    </View>
  );
};
