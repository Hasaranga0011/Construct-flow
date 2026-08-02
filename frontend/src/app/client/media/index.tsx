import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

// Mock gallery data for demonstration
const MOCK_GALLERY = [
  { id: '1', title: 'Site Groundbreaking', date: '2026-01-15', caption: 'Foundation laying ceremony', icon: 'construct', color: 'bg-orange-100', iconColor: '#F97316' },
  { id: '2', title: 'Foundation Complete', date: '2026-02-10', caption: 'Concrete foundation poured and set', icon: 'layers', color: 'bg-blue-100', iconColor: '#3B82F6' },
  { id: '3', title: 'Structural Steel', date: '2026-03-05', caption: 'Steel framework erected', icon: 'grid', color: 'bg-gray-100', iconColor: '#6B7280' },
  { id: '4', title: 'First Floor Progress', date: '2026-04-12', caption: 'Masonry work on first floor', icon: 'home', color: 'bg-green-100', iconColor: '#22C55E' },
  { id: '5', title: 'Roof Framing', date: '2026-05-20', caption: 'Roof beams and trusses installed', icon: 'business', color: 'bg-purple-100', iconColor: '#8B5CF6' },
  { id: '6', title: 'Interior Walls', date: '2026-06-08', caption: 'Internal partition walls complete', icon: 'apps', color: 'bg-yellow-100', iconColor: '#EAB308' },
];

export default function ClientMediaPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProjects = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        const userId = sessionData.session.user.id;

        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('client_id', userId);

        if (isMounted && data && data.length > 0) {
          setProjects(data);
          setSelectedProjectId(data[0].id);
        }
      } catch (error) {
        console.error('Client media error:', error);
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

            {projects.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <Ionicons name="images-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4 font-medium">No projects with media available.</Text>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-xl font-bold text-gray-800">Site Progress Photos</Text>
                  <View className="flex-row items-center bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">
                    <Ionicons name="information-circle-outline" size={14} color="#F97316" />
                    <Text className="text-orange-700 text-xs font-semibold ml-1">Mock Gallery</Text>
                  </View>
                </View>

                {/* Photo Grid */}
                <View className="flex-row flex-wrap gap-4">
                  {MOCK_GALLERY.map(item => (
                    <Pressable key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                      style={{ width: '31%' }}>
                      {/* Image Placeholder */}
                      <View className={`${item.color} h-36 items-center justify-center`}>
                        <Ionicons name={item.icon as any} size={48} color={item.iconColor} />
                      </View>
                      <View className="p-3">
                        <Text className="font-bold text-gray-800 text-sm">{item.title}</Text>
                        <Text className="text-gray-500 text-xs mt-0.5">{item.caption}</Text>
                        <View className="flex-row items-center mt-2">
                          <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
                          <Text className="text-gray-400 text-xs ml-1">{new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* Upload Notice Banner */}
                <View className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5 flex-row items-center">
                  <Ionicons name="cloud-upload-outline" size={24} color="#3B82F6" className="mr-3" />
                  <View className="flex-1 ml-3">
                    <Text className="font-bold text-blue-700">Cloudinary Integration Pending</Text>
                    <Text className="text-blue-600 text-xs mt-1">Real site photos uploaded by Site Managers will appear here once Cloudinary is connected.</Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
