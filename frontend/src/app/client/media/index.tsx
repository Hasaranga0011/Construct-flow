import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Image } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

type Photo = { id: string; project_id: string; file_url: string; caption?: string | null; file_type?: string | null; uploaded_at: string };

export default function ClientMediaPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProjects = async () => {
      try {
      setError(null);
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        const userId = sessionData.session.user.id;

        const { data, error: projectError } = await supabase
          .from('projects')
          .select('id, name')
          .eq('client_id', userId);

        if (projectError) throw projectError;

        if (isMounted && data && data.length > 0) {
          setProjects(data);
          setSelectedProjectId(data[0].id);
        }
        const projectIds = (data || []).map(project => project.id);
        if (projectIds.length > 0) {
          const { data: photoData, error: photoError } = await supabase
            .from('site_media')
            .select('id, project_id, file_url, caption, file_type, uploaded_at')
            .in('project_id', projectIds)
            .order('uploaded_at', { ascending: true });
          if (photoError) throw photoError;
          if (isMounted) setPhotos((photoData || []) as Photo[]);
        }
      } catch (error) {
        if (isMounted) setError(error instanceof Error ? error.message : 'Failed to load project media.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProjects();
    return () => { isMounted = false; };
  }, []);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Media & Gallery" showAction={false} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <View className="flex-1">
          {/* Project Selector */}
          {projects.length > 0 && (
            <View className="bg-white px-6 pt-4 border-b border-gray-200">
              <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {projects.map(project => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={project.id}
                    onPress={() => setSelectedProjectId(project.id)}
                    className={`mr-6 pb-3 border-b-2 ${selectedProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${selectedProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                      {project.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-8" showsVerticalScrollIndicator={false}>

            {error ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 mt-4 text-center">{error}</Text>
              </View>
            ) : projects.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <Ionicons name="images-outline" size={48} color="#E5E7EB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 font-medium">No projects with media available.</Text>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between items-center mb-6">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800">Site Progress Photos</Text>
                </View>

                {/* Timeline Photo Grid */}
                <View className="ml-4 md:ml-8 border-l-2 border-brand-orange pl-6 py-2 relative">
                  {photos.filter(photo => photo.project_id === selectedProjectId).map((photo, index) => (
                    <View key={photo.id} className="mb-10 relative">
                      {/* Timeline dot */}
                      <View className="absolute -left-[35px] top-4 w-4 h-4 rounded-full bg-brand-orange border-4 border-brand-light" />
                      
                      <View className="flex-row items-center mb-3">
                        <View className="bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100 flex-row items-center">
                          <Ionicons name="calendar-outline" size={14} color="#F97316" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs ml-1.5">
                            {new Date(photo.uploaded_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                          </Text>
                        </View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-bold ml-4 uppercase text-xs tracking-wider">
                          Progress Update {index + 1}
                        </Text>
                      </View>

                      <View className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-3xl">
                        <Image source={{ uri: photo.file_url }} className="w-full h-64 md:h-96 bg-gray-100" resizeMode="cover" />
                        <View className="p-5 flex-row justify-between items-start">
                          <View className="flex-1 pr-4">
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800 text-lg mb-1">{photo.caption || 'Site Progress'}</Text>
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Visual analysis available for client review.</Text>
                          </View>
                          <View className="bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 items-center justify-center">
                            <Ionicons name="analytics-outline" size={20} color="#6B7280" />
                            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-[10px] font-bold mt-1">ANALYZE</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {photos.filter(photo => photo.project_id === selectedProjectId).length === 0 && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-center py-12">No progress photos have been uploaded for this project.</Text>}

                {/* Upload Notice Banner */}
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
