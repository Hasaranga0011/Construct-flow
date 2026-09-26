import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

type Milestone = { id: string; title: string; description?: string | null; completion_percentage?: number | null; due_date?: string | null; status?: string | null };
type Media = { id: string; url: string; caption?: string | null };

export default function AdminMilestoneDetailPage() {
  const { id: projectId, milestoneId } = useLocalSearchParams<{ id: string; milestoneId: string }>();
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [completion, setCompletion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!projectId || !milestoneId) return;
    let isMounted = true;
    const loadDetail = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('milestones')
          .select('id, title, description, completion_percentage, due_date, status, milestone_media(id, url, caption)')
          .eq('id', milestoneId)
          .eq('project_id', projectId)
          .single();
        if (queryError) throw queryError;
        if (isMounted) {
          setMilestone(data as Milestone);
          setMedia((data?.milestone_media || []) as Media[]);
          setCompletion(String(data?.completion_percentage ?? 0));
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load milestone.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDetail();
    const channel = supabase.channel(`admin-milestone:${milestoneId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones', filter: `id=eq.${milestoneId}` }, () => setRefreshTrigger(value => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestone_media' }, () => setRefreshTrigger(value => value + 1))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [projectId, milestoneId, refreshTrigger]);

  const save = async () => {
    const value = Number(completion);
    if (!projectId || !milestoneId || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('Completion must be between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.projects.updateMilestone(projectId, milestoneId, {
        completion_percentage: value,
        status: value >= 100 ? 'Completed' : value > 0 ? 'In Progress' : 'Pending'
      });
      const message = 'Milestone updated successfully.';
      if (Platform.OS === 'web') window.alert(message); else Alert.alert('Success', message);
      setRefreshTrigger(current => current + 1);
    } catch (saveError: any) {
      setError(saveError.message || 'Failed to update milestone.');
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploading(true);
        setError(null);
        const asset = result.assets[0];
        
        // Prepare FormData
        const formData = new FormData();
        const filename = asset.uri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('file', {
          uri: asset.uri,
          name: filename,
          type
        } as any);
        formData.append('project_id', projectId);
        formData.append('caption', 'Milestone Progress Update');

        // Fetch using API URL with Bearer Token from api wrapper
        const uploadUrl = `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api'}/media/upload`;
        
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Upload failed: ${errText}`);
        }
        
        const responseData = await response.json();
        
        // Insert into milestone_media
        if (responseData.url) {
          const { error: insertError } = await supabase
            .from('milestone_media')
            .insert({
              milestone_id: milestoneId,
              url: responseData.url,
              caption: 'Milestone Progress Update'
            });
            
          if (insertError) throw insertError;
          setRefreshTrigger(t => t + 1);
          if (Platform.OS === 'web') window.alert('Photo uploaded'); else Alert.alert('Success', 'Photo uploaded');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={milestone?.title || 'Milestone Detail'} showAction={false} />
      <ScrollView className="flex-1 p-6">
        {loading ? (
          <View className="items-center py-16"><ActivityIndicator color="#F97316" size="large" /></View>
        ) : error && !milestone ? (
          <Text className="text-red-600">{error}</Text>
        ) : !milestone ? (
          <Text className="text-gray-500">Milestone not found.</Text>
        ) : (
          <>
            <View className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
              <Text className="text-2xl font-bold text-brand-text">{milestone.title}</Text>
              <Text className="text-gray-600 mt-3">{milestone.description || 'No description provided.'}</Text>
              <Text className="text-gray-500 text-sm mt-3">
                Due {milestone.due_date ? new Date(milestone.due_date).toLocaleDateString('en-GB') : 'Not set'} · 
                <Text className="font-bold ml-2"> {milestone.status || 'Pending'}</Text>
              </Text>
              
              {/* Completion Progress Bar View */}
              <View className="mt-4 mb-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <View 
                  className="h-full bg-brand-success rounded-full" 
                  style={{ width: `${Math.max(0, Math.min(100, Number(milestone.completion_percentage || 0)))}%` }} 
                />
              </View>

              {error && <Text className="text-red-600 mt-4">{error}</Text>}
              
              <Text className="text-sm font-semibold text-gray-700 mt-6 mb-2">Update Completion Percentage</Text>
              <View className="flex-row items-center">
                <TextInput 
                  value={completion} 
                  onChangeText={setCompletion} 
                  keyboardType="numeric" 
                  className="flex-1 border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text" 
                  placeholder="0 - 100"
                />
                <Pressable onPress={save} disabled={saving} className="bg-brand-orange rounded-xl px-5 py-4 ml-3">
                  <Text className="text-white font-bold">{saving ? 'Saving...' : 'Update'}</Text>
                </Pressable>
              </View>
            </View>
            
            <View className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
              <View className="flex-row justify-between items-center mb-5">
                <Text className="text-lg font-bold text-brand-text">Attached Media</Text>
                <Pressable onPress={uploadPhoto} disabled={uploading} className="bg-gray-100 px-4 py-2 rounded-lg flex-row items-center">
                  {uploading ? (
                    <ActivityIndicator size="small" color="#6B7280" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={18} color="#4B5563" className="mr-2" />
                      <Text className="text-gray-700 font-semibold ml-2">Upload</Text>
                    </>
                  )}
                </Pressable>
              </View>
              
              {media.length === 0 ? (
                <View className="items-center py-6">
                  <Ionicons name="images-outline" size={32} color="#D1D5DB" />
                  <Text className="text-gray-500 mt-2">No media attached to this milestone.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4">
                    {media.map(item => (
                      <View key={item.id} className="relative rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                        <Image source={{ uri: item.url }} style={{ width: 150, height: 150 }} resizeMode="cover" />
                        {item.caption && (
                          <View className="absolute bottom-0 left-0 right-0 bg-black/50 p-2">
                            <Text className="text-white text-xs text-center" numberOfLines={1}>{item.caption}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
