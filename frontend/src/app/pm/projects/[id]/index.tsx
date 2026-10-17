import { firstRelation } from '@/utils/relations';
import { notify, confirmAction } from '@/utils/notify';
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../../../hooks/useResponsive';
import { AutoFitText } from '@/components/common/AutoFitText';
import { ProjectImage } from '@/components/common/ProjectImage';
import { RoleAvatar } from '@/components/common/RoleAvatar';

export default function PMProjectDetailsPage() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(rawId) ? rawId[0] : rawId) as string;
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const projectGalleryImages: string[] = useMemo(() => {
    if (!project) return [];
    const list: string[] = [];
    if (Array.isArray(project.images)) {
      project.images.forEach((img: any) => {
        if (typeof img === 'string' && img.trim().length > 0 && !list.includes(img)) {
          list.push(img);
        }
      });
    }
    if (project.image_url && !list.includes(project.image_url)) {
      list.unshift(project.image_url);
    }
    return list;
  }, [project]);

  const activeHeroImage = projectGalleryImages[selectedImageIndex] || project?.image_url;

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

        const [pmRes, clientRes, roleRes] = await Promise.all([
          projData.pm_id
            ? supabase.from('profiles').select('full_name, role, avatar_url').eq('id', projData.pm_id).single()
            : Promise.resolve({ data: null } as any),
          projData.client_id
            ? supabase.from('profiles').select('full_name, role, avatar_url').eq('id', projData.client_id).single()
            : Promise.resolve({ data: null } as any),
          supabase
            .from('project_role_assignments')
            .select('user_id, role, profiles (full_name, email, role, avatar_url)')
            .eq('project_id', id)
        ]);

        if (pmRes.data) (projData as any).pm = pmRes.data;
        if (clientRes.data) (projData as any).client = clientRes.data;
        const roleData = roleRes.data;
        if (roleRes.error) throw roleRes.error;

        if (isMounted) {
            setProject(projData);
            if (roleData) {
              const otherStaff = roleData.filter((a: any) => a.role !== 'pm' && a.role !== 'client');
              setAssignments(otherStaff.map((a: any) => ({ ...a, profiles: firstRelation(a.profiles) })));
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
            <View className="bg-white rounded-3xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
              {/* Project Cover Image */}
              <View className="relative w-full" style={{ height: isMobile ? 150 : 210 }}>
                <ProjectImage
                  project={{ ...project, image_url: activeHeroImage }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
                <View className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <View className="absolute top-4 right-4">
                  <View className={`px-3 py-1.5 rounded-full ${project.status === 'active' ? 'bg-[#DCFCE7]' : 'bg-gray-100'}`}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold uppercase tracking-wider text-xs ${project.status === 'active' ? 'text-brand-success' : 'text-gray-600'}`}>
                      {project.status}
                    </Text>
                  </View>
                </View>
                <View className="absolute bottom-4 left-5 right-5">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl md:text-3xl font-black text-white mb-1 shadow-sm">{project.name}</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="location-outline" size={15} color="#E5E7EB" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-200 text-xs md:text-sm ml-1 font-medium">{project.location}</Text>
                  </View>
                </View>
              </View>

              {/* Multi-Image Gallery Strip (if > 1 image uploaded) */}
              {projectGalleryImages.length > 1 && (
                <View className="bg-slate-900 px-4 py-2.5 flex-row items-center border-b border-slate-800">
                  <View className="flex-row items-center gap-1.5 mr-3">
                    <Ionicons name="images" size={14} color="#F97316" />
                    <Text className="text-[11px] font-bold text-slate-300">
                      Photos ({projectGalleryImages.length})
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                    {projectGalleryImages.map((imgUrl, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setSelectedImageIndex(i)}
                        className={`rounded-lg overflow-hidden border-2 mr-2 ${selectedImageIndex === i ? 'border-brand-orange scale-105' : 'border-slate-700 opacity-60'}`}
                        style={{ width: 52, height: 38 }}
                      >
                        <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View className="p-5 md:p-8">

              {/* Stats Row */}
              <View style={isMobile ? { flexDirection: 'column', gap: 16, paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' } : { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 24, borderTopWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Total Budget</Text>
                  <AutoFitText value={`Rs. ${project.total_budget?.toLocaleString() || 'N/A'}`} maxFontSize={20} minFontSize={14} className="font-bold text-gray-800" />
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Spent Cost</Text>
                  <AutoFitText value={`Rs. ${project.spent_cost?.toLocaleString() || '0'}`} maxFontSize={20} minFontSize={14} className="font-bold text-brand-orange" />
                </View>
                <View style={isMobile ? { width: '100%' } : { width: '30%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase font-bold mb-1">Target End</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-medium text-gray-800">
                    {new Date(project.end_date).toDateString()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

            <View style={isMobile ? { flexDirection: 'column', gap: 24 } : { flexDirection: 'row', gap: 24 }}>
              {/* Personnel Details */}
              <View style={isMobile ? { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' } : { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Assigned Personnel</Text>

                <View className="mb-4 flex-row items-center gap-3">
                  <RoleAvatar
                    role="pm"
                    name={project.pm?.full_name || 'Project Manager'}
                    avatarUrl={project.pm?.avatar_url}
                    size="md"
                    showBadge={true}
                  />
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Project Manager</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.pm?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                <View className="mb-4 flex-row items-center gap-3">
                  <RoleAvatar
                    role="client"
                    name={project.client?.full_name || 'Client'}
                    avatarUrl={project.client?.avatar_url}
                    size="md"
                    showBadge={true}
                  />
                  <View className="flex-1 min-w-0">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase">Client</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium">{project.client?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                {assignments.length > 0 && (
                  <View className="mt-4 pt-4 border-t border-gray-100">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 font-bold uppercase mb-3">Other Assigned Staff</Text>
                    {assignments.map((a: any, i: number) => (
                      <View key={i} className="flex-row items-center mb-3 gap-3">
                        <RoleAvatar
                          role={a.role}
                          name={a.profiles?.full_name}
                          avatarUrl={a.profiles?.avatar_url}
                          size="sm"
                          showBadge={false}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 text-sm font-medium" numberOfLines={1}>{a.profiles?.full_name || 'Unknown User'}</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 capitalize" numberOfLines={1}>{a.role?.replace('_', ' ')}</Text>
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
