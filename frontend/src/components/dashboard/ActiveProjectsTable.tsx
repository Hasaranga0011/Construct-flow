import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { EditProjectModal } from './EditProjectModal';
import { useDebounce } from '../../hooks/useDebounce';

import { useResponsive } from '../../hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';

const ProjectRow = ({ project, onManage }: { project: any, onManage: (p: any) => void }) => {
  const { name, location, completion_percentage: progress, status } = project;
  const { isMobile } = useResponsive();

  if (isMobile) {
    return (
      <View className="flex-col py-4 border-b border-gray-100 w-full">
        <View className="flex-row justify-between items-start mb-2 w-full">
          <View className="flex-row items-center flex-1 pr-2">
            <View className="w-11 h-11 bg-orange-50 rounded-lg items-center justify-center mr-3">
              <Ionicons name="business" size={20} color="#EA580C" />
            </View>
            <View className="flex-1 min-w-0">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm flex-wrap">{name}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs flex-wrap">{location}</Text>
            </View>
          </View>
          <View className={`mt-1 ${['active', 'Active', 'In Progress', 'in progress'].includes(status) ? 'bg-green-50' : 'bg-gray-100'} px-2 py-1 rounded self-start`}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`${['active', 'Active', 'In Progress', 'in progress'].includes(status) ? 'text-green-600' : 'text-gray-500'} text-[10px] font-bold uppercase`}>{status}</Text>
          </View>
        </View>
        <View className="w-full mb-3">
          <View className="flex-row justify-between mb-1">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Progress</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs font-bold">{progress}%</Text>
          </View>
          <View className="h-1.5 bg-gray-100 rounded-full w-full overflow-hidden">
            <View className="h-full bg-brand-orange rounded-full" style={{ width: `${progress}%` }} />
          </View>
        </View>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => onManage(project)} className="w-full py-2.5 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors items-center justify-center">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs font-bold uppercase tracking-wider">Manage</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      {/* Thumbnail */}
      <View className="w-11 h-11 bg-gray-200 rounded-md mr-4 items-center justify-center">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-bold">{name.charAt(0)}</Text>
      </View>
      
      {/* Details */}
      <View className="flex-1 justify-center pr-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">{name}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{location}</Text>
      </View>
      
      {/* Status Badge */}
      <View className={`${['active', 'Active', 'In Progress', 'in progress'].includes(status) ? 'bg-[#DCFCE7]' : 'bg-gray-100'} px-2 py-1 rounded mr-6`}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`${['active', 'Active', 'In Progress', 'in progress'].includes(status) ? 'text-brand-success' : 'text-gray-500'} text-xs font-semibold`}>{status}</Text>
      </View>
      
      {/* Progress */}
      <View className="w-24 flex-row items-center mr-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm w-10">{progress}%</Text>
        <View className="flex-1 h-2 bg-gray-100 rounded-full ml-2">
          <View 
            className="h-full bg-brand-orange rounded-full" 
            style={{ width: `${progress}%` }} 
          />
        </View>
      </View>

      {/* Manage Button */}
      <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => onManage(project)} className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-xs font-semibold">Manage</Text>
      </Pressable>
    </View>
  );
};

export const ActiveProjectsTable = ({ refreshTrigger = 0, searchQuery = '', pmId }: { refreshTrigger?: number, searchQuery?: string, pmId?: string }) => {
  const router = useRouter();
  const { isMobile } = useResponsive();
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
          .select('*')
          .in('status', ['active', 'Active', 'In Progress', 'in progress'])
          .order('created_at', { ascending: false });
          
        if (pmId) {
          query = query.eq('pm_id', pmId);
        }
          


        const { data: projectsData, error } = await query;
        if (error) throw error;
        
        let finalProjects = (projectsData || []).filter(p => `${p.name || ''} ${p.location || ''}`.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));
        
        // Fetch milestones to calculate progress
        if (finalProjects.length > 0) {
           const projectIds = finalProjects.map(p => p.id);
           const { data: milestonesData } = await supabase
             .from('milestones')
             .select('project_id, completion_percentage')
             .in('project_id', projectIds);
             
           if (milestonesData) {
             finalProjects = finalProjects.map(p => {
               const p_mils = milestonesData.filter(m => m.project_id === p.id);
               let progress = 0;
               if (p_mils.length > 0) {
                 const total = p_mils.reduce((sum, m) => sum + (m.completion_percentage || 0), 0);
                 progress = Math.round(total / p_mils.length);
               }
               return { ...p, completion_percentage: progress };
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
  }, [refreshTrigger, debouncedSearchQuery, localRefresh, pmId]);

  const handleManage = (project: any) => {
    setSelectedProject(project);
    setShowEditModal(true);
  };

  return (
    <View className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 ${isMobile ? '' : 'flex-1 min-h-[300px]'}`}>
      <View className="flex-row justify-between items-center mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Active Projects</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(pmId ? '/pm/projects' : '/admin/projects')}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">View all →</Text>
        </Pressable>
      </View>

      <View className={isMobile ? "w-full" : "flex-1"}>
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : projects.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No active projects found.</Text>
          </View>
        ) : (
          projects.map(p => (
            <ProjectRow 
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
