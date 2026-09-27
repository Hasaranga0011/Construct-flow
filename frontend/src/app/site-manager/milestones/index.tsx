import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Alert, Platform, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string;
  completion_percentage: number;
  status: string;
  milestone_media?: { id: string; url: string; caption: string }[];
};

export default function SMMilestonesPage() {
  const { user } = useAuth();
  const { assignedProjectIds, loading: sitesLoading } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Modal state
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [completion, setCompletion] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);

      const { data: projectsData } = assignedProjectIds.length
        ? await supabase.from('projects').select('id, name').in('id', assignedProjectIds).eq('status', 'active')
        : { data: [] };

      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      const currentProject = activeProjectId || parsedProjects[0]?.id || null;
      if (!activeProjectId && currentProject) setActiveProjectId(currentProject);

      if (currentProject) {
        const { data: msData } = await supabase
          .from('milestones')
          .select('*, milestone_media(id, url, caption)')
          .eq('project_id', currentProject)
          .order('due_date', { ascending: true });
        
        setMilestones(msData || []);
      }
    } catch (error) {
      console.error('Error fetching milestones', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, activeProjectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenModal = (ms: Milestone) => {
    setSelectedMilestone(ms);
    setCompletion(String(ms.completion_percentage || 0));
    setNotes('');
    setPhotoUrl(null);
  };

  const handleUploadPhoto = async () => {
    if (Platform.OS === 'web') {
      const url = window.prompt('Paste a Cloudinary photo URL (Web mock):');
      if (url) setPhotoUrl(url);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploading(true);
        const asset = result.assets[0];
        
        const formData = new FormData();
        const filename = asset.uri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('file', { uri: asset.uri, name: filename, type } as any);
        if (activeProjectId) formData.append('project_id', activeProjectId);
        formData.append('caption', 'Milestone Update');

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/media/upload`, {
          method: 'POST',
          body: formData,
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        
        if (!response.ok) throw new Error('Upload failed');
        const responseData = await response.json();
        if (responseData.url) setPhotoUrl(responseData.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitUpdate = async () => {
    if (!selectedMilestone || !activeProjectId) return;
    const value = Number(completion);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      Alert.alert('Invalid', 'Completion must be between 0 and 100.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update the milestone
      await api.projects.updateMilestone(activeProjectId, selectedMilestone.id, {
        completion_percentage: value,
        status: value >= 100 ? 'Completed' : value > 0 ? 'In Progress' : 'Pending'
      });

      // 2. Insert media/notes if provided
      if (photoUrl) {
        await supabase
          .from('milestone_media')
          .insert({
            milestone_id: selectedMilestone.id,
            url: photoUrl,
            caption: notes || 'Progress Update'
          });
      }

      toast('Progress updated successfully');
      setSelectedMilestone(null);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update milestone');
    } finally {
      setSubmitting(false);
    }
  };

  const toast = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Success', msg);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-700';
      case 'In Progress': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Project Milestones" showAction={false} />

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <View className="flex-1">
          {projects.length > 0 && (
            <View className="bg-white px-6 pt-4 border-b border-gray-200">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {projects.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => setActiveProjectId(p.id)}
                    className={`mr-6 pb-3 border-b-2 ${activeProjectId === p.id ? 'border-brand-orange' : 'border-transparent'}`}
                  >
                    <Text className={`font-bold text-base ${activeProjectId === p.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView className="flex-1 p-6">
            {milestones.length === 0 ? (
              <View className="bg-white p-10 rounded-2xl items-center border border-gray-100 shadow-sm mt-4">
                <Ionicons name="flag-outline" size={48} color="#D1D5DB" />
                <Text className="text-gray-400 mt-4 text-center font-medium">No milestones found for this project.</Text>
              </View>
            ) : (
              milestones.map(ms => (
                <View key={ms.id} className="bg-white rounded-2xl p-6 mb-4 border border-gray-100 shadow-sm">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 pr-4">
                      <Text className="text-xl font-bold text-brand-text">{ms.title}</Text>
                      <Text className="text-gray-500 mt-1">{ms.description}</Text>
                      <Text className="text-gray-400 text-sm mt-2">Due: {ms.due_date ? new Date(ms.due_date).toLocaleDateString() : 'N/A'}</Text>
                    </View>
                    <View className={`px-3 py-1 rounded-full ${getStatusColor(ms.status).split(' ')[0]}`}>
                      <Text className={`text-xs font-bold ${getStatusColor(ms.status).split(' ')[1]}`}>{ms.status || 'Pending'}</Text>
                    </View>
                  </View>

                  <View className="mt-4 mb-4">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-xs font-bold text-gray-500">Progress</Text>
                      <Text className="text-xs font-bold text-brand-text">{ms.completion_percentage || 0}%</Text>
                    </View>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <View 
                        className="h-full bg-brand-orange rounded-full" 
                        style={{ width: `${ms.completion_percentage || 0}%` }} 
                      />
                    </View>
                  </View>

                  <Pressable 
                    onPress={() => handleOpenModal(ms)}
                    className="bg-brand-light border border-gray-200 py-3 rounded-xl items-center flex-row justify-center mt-2"
                  >
                    <Ionicons name="create-outline" size={18} color="#4B5563" style={{ marginRight: 8 }} />
                    <Text className="text-gray-700 font-bold">Update Progress</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {selectedMilestone && (
        <Modal transparent animationType="fade">
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-bold text-brand-text">Update Milestone</Text>
                <Pressable onPress={() => setSelectedMilestone(null)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </Pressable>
              </View>

              <Text className="text-sm font-bold text-gray-700 mb-2">Completion Percentage (%)</Text>
              <TextInput
                value={completion}
                onChangeText={setCompletion}
                keyboardType="numeric"
                placeholder="e.g. 50"
                className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4 text-brand-text font-bold"
              />

              <Text className="text-sm font-bold text-gray-700 mb-2">Notes / Update Summary</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="What was completed?"
                multiline
                className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4 h-24 text-brand-text"
              />

              <Text className="text-sm font-bold text-gray-700 mb-2">Photo Proof (Optional)</Text>
              {photoUrl ? (
                <View className="relative h-32 rounded-xl overflow-hidden mb-6 border border-gray-200">
                  <View className="absolute inset-0 bg-gray-100 items-center justify-center">
                    <Ionicons name="image-outline" size={24} color="#9CA3AF" />
                    <Text className="text-gray-500 text-xs mt-1">Photo Attached</Text>
                  </View>
                  <Pressable 
                    onPress={() => setPhotoUrl(null)}
                    className="absolute top-2 right-2 bg-black/50 rounded-full p-1"
                  >
                    <Ionicons name="close" size={16} color="white" />
                  </Pressable>
                </View>
              ) : (
                <Pressable 
                  onPress={handleUploadPhoto}
                  disabled={uploading}
                  className="border border-dashed border-gray-300 rounded-xl py-6 items-center mb-6 bg-gray-50"
                >
                  {uploading ? (
                    <ActivityIndicator color="#F97316" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={24} color="#9CA3AF" />
                      <Text className="text-gray-500 mt-2 font-semibold text-sm">Upload Photo</Text>
                    </>
                  )}
                </Pressable>
              )}

              <Pressable
                onPress={handleSubmitUpdate}
                disabled={submitting}
                className="bg-brand-orange py-4 rounded-xl items-center shadow-sm"
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">Submit Update</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
