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
  const isActive = ['active', 'Active', 'In Progress', 'in progress'].includes(status);

  if (isMobile) {
    return (
      <View style={{ flexDirection: 'column', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', width: '100%', minHeight: 120 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, width: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
            <View style={{ width: 44, height: 44, backgroundColor: '#FFF7ED', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Ionicons name="business" size={20} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>{name}</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ color: '#6B7280', fontSize: 12 }}>{location}</Text>
            </View>
          </View>
          <View style={{ marginTop: 4, backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start' }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: isActive ? '#16A34A' : '#6B7280', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>{status}</Text>
          </View>
        </View>
        
        <View style={{ width: '100%', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: '#6B7280', fontSize: 12 }}>Progress</Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontSize: 12, fontWeight: 'bold' }}>{progress}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 9999, width: '100%', overflow: 'hidden' }}>
            <View style={{ height: '100%', backgroundColor: '#F97316', borderRadius: 9999, width: `${progress}%` }} />
          </View>
        </View>

        <Pressable 
          style={{ minHeight: 44, width: '100%', paddingVertical: 10, backgroundColor: '#F3F4F6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }} 
          onPress={() => onManage(project)}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Manage</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', width: '100%', minHeight: 76 }}>
      {/* Thumbnail */}
      <View style={{ width: 44, height: 44, backgroundColor: '#E5E7EB', borderRadius: 6, marginRight: 16, alignItems: 'center', justifyContent: 'center' }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#9CA3AF', fontWeight: 'bold' }}>{name.charAt(0)}</Text>
      </View>
      
      {/* Details */}
      <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontWeight: '600', fontSize: 14 }}>{name}</Text>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#6B7280', fontSize: 12 }}>{location}</Text>
      </View>
      
      {/* Status Badge */}
      <View style={{ backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 24 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: isActive ? '#16A34A' : '#6B7280', fontSize: 12, fontWeight: '600' }}>{status}</Text>
      </View>
      
      {/* Progress */}
      <View style={{ width: 96, flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontWeight: 'bold', fontSize: 14, width: 40 }}>{progress}%</Text>
        <View style={{ flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 9999, marginLeft: 8, overflow: 'hidden' }}>
          <View style={{ height: '100%', backgroundColor: '#F97316', borderRadius: 9999, width: `${progress}%` }} />
        </View>
      </View>

      {/* Manage Button */}
      <Pressable style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 4, justifyContent: 'center' }} onPress={() => onManage(project)}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#111827', fontSize: 12, fontWeight: '600' }}>Manage</Text>
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
    <View className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 ${isMobile ? '' : 'w-full min-h-[300px]'}`}>
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
