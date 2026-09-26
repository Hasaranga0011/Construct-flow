import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../context/AuthContext';

type Project = { id: string; name: string };
type Milestone = { id: string; project_id: string; title: string; description?: string | null; due_date?: string | null; completion_percentage?: number | null; status?: string | null };

export default function ClientProjectMilestonesPage() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectId || null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadData = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data: projectData, error: projectError } = await supabase.from('projects').select('id, name').eq('client_id', user.id).order('created_at', { ascending: false });
        if (projectError) throw projectError;
        const clientProjects = (projectData || []) as Project[];
        const selectedId = activeProjectId || clientProjects[0]?.id || null;
        if (isMounted) {
          setProjects(clientProjects);
          if (!activeProjectId && selectedId) setActiveProjectId(selectedId);
        }
        if (!selectedId) {
          if (isMounted) setMilestones([]);
          return;
        }
        const { data, error: milestoneError } = await supabase.from('milestones').select('id, project_id, title, description, due_date, completion_percentage, status').eq('project_id', selectedId).order('due_date', { ascending: true });
        if (milestoneError) throw milestoneError;
        if (isMounted) setMilestones((data || []) as Milestone[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load milestones.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    const channel = supabase.channel(`client-milestones:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, loadData).subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, activeProjectId]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Project Milestones" showAction={false} />
      <View className="flex-1 p-6">
        {projects.length > 0 && <View className="flex-row mb-5"><FlatList data={projects} horizontal showsHorizontalScrollIndicator={false} keyExtractor={item => item.id} renderItem={({ item }) => <Pressable onPress={() => setActiveProjectId(item.id)} className={`mr-5 pb-3 border-b-2 ${activeProjectId === item.id ? 'border-brand-orange' : 'border-transparent'}`}><Text className={`font-bold ${activeProjectId === item.id ? 'text-brand-orange' : 'text-gray-500'}`}>{item.name}</Text></Pressable>} /></View>}
        {error ? <View className="bg-red-50 border border-red-200 rounded-2xl p-5"><Text className="text-red-700">{error}</Text></View> : loading ? <View className="gap-3"><View className="bg-gray-100 rounded-2xl h-20 animate-pulse" /><View className="bg-gray-100 rounded-2xl h-20 animate-pulse" /></View> : milestones.length === 0 ? <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center"><Ionicons name="flag-outline" size={48} color="#D1D5DB" /><Text className="text-gray-500 mt-4">No milestones have been created for this project.</Text></View> : <FlatList data={milestones} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} renderItem={({ item }) => {
          const progress = Number(item.completion_percentage || 0);
          const completed = item.status === 'Completed' || progress >= 100;
          return <View className="flex-row bg-white rounded-xl border border-gray-100 p-5 mb-4"><View className={`w-11 h-11 rounded-full items-center justify-center mr-4 ${completed ? 'bg-green-100' : 'bg-orange-100'}`}><Ionicons name={completed ? 'checkmark' : 'time'} size={22} color={completed ? '#16A34A' : '#F97316'} /></View><View className="flex-1"><Text className="text-lg font-bold text-gray-800">{item.title}</Text><Text className="text-gray-500 mt-1">{item.description || 'No description provided'}</Text><View className="flex-row justify-between mt-3"><Text className="text-gray-400 text-xs">Due {item.due_date ? new Date(item.due_date).toLocaleDateString('en-GB') : 'Not set'}</Text><Text className="text-brand-orange text-xs font-bold">{progress}%</Text></View><View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2"><View className={`h-full bg-brand-orange rounded-full ${progress <= 0 ? 'w-0' : progress < 25 ? 'w-1/4' : progress < 50 ? 'w-1/2' : progress < 75 ? 'w-3/4' : 'w-full'}`} /></View></View></View>;
        }} />}
      </View>
    </View>
  );
}
