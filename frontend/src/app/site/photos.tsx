import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, Alert, TextInput, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useResponsive } from '../../hooks/useResponsive';

export default function SitePhotos() {
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<any[]>([]);
  
  // Upload Modal State
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [description, setDescription] = useState('');
  
  // Projects State for Dropdown
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_photos')
        .select('*, projects(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase.from('projects').select('id, name').eq('status', 'active');
      if (!error && data) setProjects(data);
    } catch (e) {}
  };

  useEffect(() => {
    loadPhotos();
    loadProjects();
  }, []);

  const handlePickPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission to access camera roll is required!');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true, // Request base64 for easy upload on React Native
    });

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      setSelectedImage(pickerResult.assets[0]);
      setDescription('');
      setSelectedProjectId(projects.length > 0 ? projects[0].id : null);
      setShowUploadModal(true);
    }
  };

  const executeUpload = async () => {
    if (!selectedImage || !selectedProjectId) {
      Alert.alert('Error', 'Please select a project first.');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload to Supabase Storage
      const fileExt = selectedImage.uri.split('.').pop() || 'jpeg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `site_uploads/${fileName}`;

      let uploadError;
      
      if (Platform.OS === 'web') {
        // Web: Fetch Blob and upload
        const response = await fetch(selectedImage.uri);
        const blob = await response.blob();
        const { error } = await supabase.storage.from('project-images').upload(filePath, blob, {
          contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
        });
        uploadError = error;
      } else {
        // React Native (iOS/Android): Use base64
        if (!selectedImage.base64) throw new Error("Could not read image data.");
        const { error } = await supabase.storage.from('project-images').upload(filePath, decode(selectedImage.base64), {
          contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
        });
        uploadError = error;
      }

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      // 3. Save to Database
      const { error: dbError } = await supabase.from('site_photos').insert({
        project_id: selectedProjectId,
        uploader_name: user?.user_metadata?.full_name || 'Site Manager',
        photo_url: publicUrl,
        description: description || 'Progress Photo'
      });

      if (dbError) throw dbError;

      Alert.alert('Success', 'Photo uploaded and saved to cloud successfully!');
      setShowUploadModal(false);
      setSelectedImage(null);
      loadPhotos();
    } catch (error: any) {
      Alert.alert('Upload Error', error.message || 'Ensure the project-images bucket exists and RLS allows inserts.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light p-8">
      <View className="flex-row justify-between items-center mb-8">
        <View>
          <Text className="text-3xl font-bold text-brand-text mb-2">Site Photos</Text>
          <Text className="text-gray-500">Visual progress tracking across all active sites.</Text>
        </View>
        <Pressable 
          onPress={handlePickPhoto}
          className="flex-row items-center bg-brand-orange hover:bg-orange-600 transition-colors px-4 py-3 rounded-xl shadow-sm"
        >
          <Ionicons name="cloud-upload-outline" size={20} color="white" className="mr-2" />
          <Text className="text-white font-bold ml-2">Upload Photo</Text>
        </Pressable>
      </View>

      {/* Upload Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <View className="p-4 border-b border-gray-100 flex-row justify-between items-center bg-gray-50">
              <Text className="text-lg font-bold text-brand-text">Photo Details</Text>
              <Pressable onPress={() => !uploading && setShowUploadModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <View className="p-6">
              {selectedImage && (
                <Image 
                  source={{ uri: selectedImage.uri }} 
                  className="w-full h-48 rounded-xl bg-gray-100 mb-6" 
                  resizeMode="cover"
                />
              )}

              <Text className="text-sm font-semibold text-gray-700 mb-2">Select Project</Text>
              <View className="border border-gray-200 rounded-xl mb-6 overflow-hidden max-h-32">
                <ScrollView nestedScrollEnabled>
                  {projects.map(p => (
                    <Pressable 
                      key={p.id}
                      onPress={() => setSelectedProjectId(p.id)}
                      className={`p-3 border-b border-gray-100 ${selectedProjectId === p.id ? 'bg-orange-50' : 'bg-white'}`}
                    >
                      <Text className={selectedProjectId === p.id ? 'text-brand-orange font-bold' : 'text-gray-600'}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                  {projects.length === 0 && <Text className="p-4 text-gray-400">No active projects found.</Text>}
                </ScrollView>
              </View>

              <Text className="text-sm font-semibold text-gray-700 mb-2">Description</Text>
              <TextInput
                className="border border-gray-200 rounded-xl p-3 text-brand-text bg-gray-50 mb-6"
                placeholder="E.g. Foundation poured for Tower A"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
              />

              <Pressable 
                onPress={executeUpload}
                disabled={uploading || !selectedProjectId}
                className={`py-4 rounded-xl flex-row items-center justify-center ${uploading || !selectedProjectId ? 'bg-orange-300' : 'bg-brand-orange hover:bg-orange-600'}`}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Confirm Upload</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Grid */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {photos.length === 0 ? (
            <View className="bg-white p-10 rounded-2xl items-center justify-center border border-gray-100">
              <Ionicons name="images-outline" size={48} color="#9CA3AF" />
              <Text className="text-gray-500 mt-4 text-center">No photos have been uploaded yet.</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-between">
              {photos.map(photo => (
                <View key={photo.id} style={{ width: isMobile ? '100%' : '48%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <Image 
                    source={{ uri: photo.photo_url }} 
                    style={{ width: '100%', height: 200 }} 
                    resizeMode="cover" 
                  />
                  <View className="p-4">
                    <Text className="font-bold text-brand-text mb-1 truncate">{photo.projects?.name || 'Unknown Site'}</Text>
                    <Text className="text-gray-500 text-xs mb-3">{photo.description}</Text>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-brand-orange font-semibold">{photo.uploader_name}</Text>
                      <Text className="text-xs text-gray-400">{new Date(photo.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
