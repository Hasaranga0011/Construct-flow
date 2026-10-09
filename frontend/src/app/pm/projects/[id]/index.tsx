import { firstRelation } from '@/utils/relations';
import { notify, confirmAction } from '@/utils/notify';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../../hooks/useResponsive';

export default function PMProjectDetailsPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchProject = async () => {
      try {
        if (!id) {
            console.error("ID is undefined!");
            if (isMounted) setLoading(false);
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Please sign in again.');
        const { data: projData, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .eq('pm_id', session.user.id)
          .single();

        if (projError) {
          console.error("Supabase Error:", projError);
          throw projError;
        }

        if (projData.pm_id) {
            const { data: pmData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.pm_id).single();
            projData.pm = pmData;
        }

        if (projData.client_id) {
            const { data: clientData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.client_id).single();
            projData.client = clientData;
        }

        const { data: roleData, error: roleError } = await supabase
          .from('project_role_assignments')
          .select('user_id, role, profiles (full_name, email, role)')
          .eq('project_id', id);

        if (roleError) throw roleError;

        if (isMounted) {
            setProject(projData);
            if (roleData) {
              const otherStaff = roleData.filter((a: any) => a.role !== 'pm' && a.role !== 'client');
              setAssignments(otherStaff.map(a => ({ ...a, profiles: firstRelation(a.profiles) })));
            }
        }
      } catch (err: any) {
        console.error('Error fetching project details', err);
        if (isMounted) setLoadError(err.message || 'Unable to load this project.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProject();

    const channel = supabase
      .channel('project_roles_' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_role_assignments', filter: `project_id=eq.${id}` }, () => {
        fetchProject();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleDeleteProject = async () => {
    if (!project || loading || !await confirmAction('Delete Project', 'Permanently delete this project? This cannot be undone.')) return;
    setLoading(true);
    try {
      const result = await supabase.from('projects').delete().eq('id', project.id).eq('pm_id', project.pm_id).select('id').single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No project was deleted.');
      notify('Deleted', 'Project deleted successfully.'); router.replace('/pm/projects');
    } catch (e: any) { notify('Unable to delete project', e.message); }
    finally { setLoading(false); }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={project ? project.name : "Project Details"} showAction={false} showBackButton />

      {!!loadError && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 p-4">{loadError}</Text>}
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : !project ? (
          <View className="py-20 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">Project not found.</Text>
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">

            {/* Header Card */}
            <View className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6 relative overflow-hidden">
              <View className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full" />

              <View className="flex-row flex-wrap gap-3 justify-between items-start mb-6">
                <View className="flex-1 pr-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-black text-gray-800 mb-2">{project.name}</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 ml-1">{project.location}</Text>
                  </View>
                </View>

                <View className={`px-4 py-2 rounded-lg ${project.status === 'active' ? 'bg-[#DCFCE7]' : 'bg-gray-100'}`}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold uppercase tracking-wider ${project.status === 'active' ? 'text-brand-success' : 'text-gray-600'}`}>
                    {project.status}
                  </Text>
                </View>
              </View>

              {/* Stats Row */}
              <View style={isMobile ? { flexDirection: 'column', gap: 16, paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' } : { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Total Budget</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800">
                    Rs. {project.total_budget?.toLocaleString() || 'N/A'}
                  </Text>
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Spent Cost</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-orange">
                    Rs. {project.spent_cost?.toLocaleString() || '0'}
                  </Text>
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Target End</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-medium text-gray-800">
                    {new Date(project.end_date).toDateString()}
                  </Text>
                </View>
              </View>
            </View>

            <View style={isMobile ? { flexDirection: 'column', gap: 24 } : { flexDirection: 'row', gap: 24 }}>
              {/* Personnel Details */}
              <View style={isMobile ? { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' } : { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Assigned Personnel</Text>

                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-blue-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={20} color="#3B82F6" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Project Manager</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.pm?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                <View className="mb-4 flex-row items-center">
                  <View className="w-11 h-11 bg-purple-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="person" size={20} color="#8B5CF6" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Client</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.client?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                {assignments.length > 0 && (
                  <View className="mt-4 pt-4 border-t border-gray-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase mb-3">Other Assigned Staff</Text>
                    {assignments.map((a: any, i: number) => (
                      <View key={i} className="flex-row items-center mb-3">
                        <View className="w-8 h-8 bg-gray-50 rounded-full items-center justify-center mr-3 border border-gray-200">
                           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-bold text-xs">{a.profiles?.full_name?.charAt(0) || 'U'}</Text>
                        </View>
                        <View>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 text-sm font-medium">{a.profiles?.full_name || 'Unknown User'}</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 capitalize">{a.role.replace('_', ' ')}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Quick Actions */}
              <View className="flex-1 w-full md:w-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                 <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Quick Actions</Text>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/pm/projects/${project.id}/milestones`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="flag" size={20} color="#F97316" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">Manage Milestones</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Track project phases & media</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/pm/projects/${project.id}/reports`)}
                    className="flex-row items-center p-3 bg-blue-50 rounded-xl mb-3 border border-blue-200"
                 >
                    <Ionicons name="document-text" size={20} color="#3B82F6" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-blue-800">View Site Reports</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-blue-600">Daily progress from Site Managers</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
                 </TouchableOpacity>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push(`/pm/projects/${project.id}/expenses`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="cash-outline" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">Budget & Procurement</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">Review recorded spend and purchase orders</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }}
                    onPress={handleDeleteProject}
                    className="flex-row items-center p-3 bg-red-50 rounded-xl border border-red-200 mt-2"
                 >
                    <Ionicons name="trash" size={20} color="#EF4444" className="mr-3" />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-red-700">Delete Project</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-red-500">Permanently remove this project</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                 </TouchableOpacity>
              </View>
            </View>

          </View>
        )}
      </ScrollView>
    </View>
  );
}
