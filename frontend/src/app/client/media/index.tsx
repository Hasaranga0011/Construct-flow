import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Image } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

type Photo = { id: string; project_id: string; url: string; caption?: string | null; category?: string | null; created_at: string };

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
            .from('photos')
            .select('id, project_id, url, caption, category, created_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false });
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {projects.map(project => (
                  <Pressable
                    key={project.id}
                    onPress={() => setSelectedProjectId(project.id)}
                    className={`mr-6 pb-3 border-b-2 ${selectedProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
                  >
                    <Text className={`font-bold text-base ${selectedProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                      {project.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>

            {error ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                <Text className="text-red-600 mt-4 text-center">{error}</Text>
              </View>
            ) : projects.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <Ionicons name="images-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4 font-medium">No projects with media available.</Text>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-xl font-bold text-gray-800">Site Progress Photos</Text>
                </View>

                {/* Photo Grid */}
                <View className="flex-row flex-wrap gap-4">
                  {photos.filter(photo => photo.project_id === selectedProjectId).map(photo => (
                    <View key={photo.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden w-full md:w-[31%]">
                      <Image source={{ uri: photo.url }} className="w-full h-36 bg-gray-100" resizeMode="cover" />
                      <View className="p-3">
                        <Text className="font-bold text-gray-800 text-sm">{photo.caption || photo.category || 'Progress photo'}</Text>
                        <View className="flex-row items-center mt-2"><Ionicons name="calendar-outline" size={12} color="#9CA3AF" /><Text className="text-gray-400 text-xs ml-1">{new Date(photo.created_at).toLocaleDateString('en-GB')}</Text></View>
                      </View>
                    </View>
                  ))}
                </View>

                {photos.filter(photo => photo.project_id === selectedProjectId).length === 0 && <Text className="text-gray-400 text-center py-12">No progress photos have been uploaded for this project.</Text>}

                {/* Upload Notice Banner */}
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
