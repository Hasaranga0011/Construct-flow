import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type MediaRecord = {
  id: string;
  project_id: string;
  url: string;
  caption?: string | null;
  category?: string | null;
  created_at: string;
};

export const ClientMediaGallery = () => {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadMedia = async () => {
      try {
        setError(null);
        const { data: projects, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('client_id', user.id);
        if (projectError) throw projectError;

        const projectIds = (projects || []).map(project => project.id);
        if (projectIds.length === 0) {
          if (isMounted) setMedia([]);
          return;
        }

        const { data, error: mediaError } = await supabase
          .from('photos')
          .select('id, project_id, url, caption, category, created_at')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false });
        if (mediaError) throw mediaError;
        if (isMounted) setMedia((data || []) as MediaRecord[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load project media.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMedia();
    return () => { isMounted = false; };
  }, [user]);

  const categories = useMemo(() => ['all', ...new Set(media.map(item => item.category).filter(Boolean) as string[])], [media]);
  const filteredMedia = activeCategory === 'all' ? media : media.filter(item => item.category === activeCategory);

  return (
    <View className="flex-1 bg-white rounded-xl border border-gray-100 p-4 md:p-6">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-gray-100 mb-6">
        {categories.map(category => (
          <Pressable key={category} onPress={() => setActiveCategory(category)} className={`mr-6 pb-3 border-b-2 ${activeCategory === category ? 'border-brand-orange' : 'border-transparent'}`}>
            <Text className={`font-semibold capitalize ${activeCategory === category ? 'text-brand-orange' : 'text-gray-500'}`}>{category === 'all' ? 'All media' : category}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <View className="py-12 items-center"><ActivityIndicator color="#F97316" /></View> : error ? (
        <Text className="text-red-600 text-center py-10">{error}</Text>
      ) : filteredMedia.length === 0 ? (
        <View className="py-12 items-center"><Ionicons name="images-outline" size={44} color="#D1D5DB" /><Text className="text-gray-500 mt-3">No project media available.</Text></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="flex-row flex-wrap -mx-2">
            {filteredMedia.map(item => (
              <View key={item.id} className="w-full md:w-1/3 px-2 mb-4">
                <View className="rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                  <Image source={{ uri: item.url }} className="w-full h-40" resizeMode="cover" />
                  <View className="p-3"><Text className="font-bold text-brand-text" numberOfLines={1}>{item.caption || item.category || 'Progress photo'}</Text><Text className="text-gray-400 text-xs mt-1">{new Date(item.created_at).toLocaleDateString('en-GB')}</Text></View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
