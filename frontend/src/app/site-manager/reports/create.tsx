import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { useRouter } from 'expo-router';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

type Project = { id: string; name: string; siteId: string };

export default function CreateSiteReportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { assignedProjectIds, assignments, loading: sitesLoading } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [workCompleted, setWorkCompleted] = useState('');
  const [workerCount, setWorkerCount] = useState('');
  const [blockers, setBlockers] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user?.id || sitesLoading) return;

      try {
        if (!assignedProjectIds.length) {
          setProjectsLoading(false);
          return;
        }

        const { data: projectsData } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', assignedProjectIds)
          .eq('status', 'active');

        const parsed: Project[] = (projectsData || []).map((p: any) => {
          const assignment = assignments.find((a: any) => a.projectId === p.id);
          return { id: p.id, name: p.name, siteId: assignment?.assignmentId || '' };
        });
        setProjects(parsed);
        if (parsed.length > 0) setSelectedProjectId(parsed[0].id);
      } catch (error) {
        console.error('Failed to load projects', error);
      } finally {
        setProjectsLoading(false);
      }
    };
    loadProjects();
  }, [user?.id, sitesLoading, assignedProjectIds, assignments]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!selectedProjectId) errs.project = 'Please select a project';
    if (!workCompleted.trim()) errs.workCompleted = 'Work completed is required';
    if (!date) errs.date = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const uploadPhoto = async () => {
    // Placeholder: In a real implementation, use expo-image-picker + POST /api/media/upload.
    // For now we show a demo URL input prompt.
    if (Platform.OS === 'web') {
      const url = window.prompt('Paste a Cloudinary photo URL:');
      if (url) setPhotoUrls(prev => [...prev, url]);
    } else {
      Alert.alert('Photo Upload', 'Use the web interface to attach photos, or integrate expo-image-picker.', [{ text: 'OK' }]);
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    if (!selectedProject) return;

    setLoading(true);
    try {
      await api.siteReports.create({
        project_id: selectedProjectId,
        site_id: selectedProject.siteId || undefined,
        date,
        work_completed: workCompleted.trim(),
        workers_present_count: workerCount ? parseInt(workerCount, 10) : undefined,
        blockers: blockers.trim() || undefined,
        photos: photoUrls.length > 0 ? photoUrls : undefined,
        materials_used: undefined,
      });

      setSubmitted(true);
      setTimeout(() => router.back(), 1800);
    } catch (error: any) {
      const msg = error.message || 'Failed to submit report';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center p-8">
        <View className="bg-white rounded-2xl p-10 items-center shadow-sm border border-gray-100 w-full max-w-md">
          <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
            <Ionicons name="checkmark" size={36} color="#22C55E" />
          </View>
          <Text className="text-2xl font-bold text-brand-text mb-2">Report Submitted!</Text>
          <Text className="text-gray-500 text-center">Your daily site report has been submitted. The PM will be notified.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="New Site Report" showAction={false} />

      {projectsLoading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">

            {/* Project picker */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Project <Text className="text-red-500">*</Text></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
              {projects.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedProjectId(p.id)}
                  className={`mr-3 px-4 py-2 rounded-full border ${selectedProjectId === p.id ? 'bg-brand-orange border-brand-orange' : 'border-gray-200 bg-gray-50'}`}
                >
                  <Text className={`font-semibold text-sm ${selectedProjectId === p.id ? 'text-white' : 'text-gray-600'}`}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {errors.project && <Text className="text-red-500 text-xs mb-3">{errors.project}</Text>}

            {/* Date */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Report Date <Text className="text-red-500">*</Text></Text>
            <TextInput
              className={`border ${errors.date ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-5 text-brand-text bg-gray-50`}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />
            {errors.date && <Text className="text-red-500 text-xs -mt-4 mb-3">{errors.date}</Text>}

            {/* Work completed */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Work Completed Today <Text className="text-red-500">*</Text></Text>
            <TextInput
              className={`border ${errors.workCompleted ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[100px]`}
              multiline
              textAlignVertical="top"
              value={workCompleted}
              onChangeText={setWorkCompleted}
              placeholder="Describe the work completed today in detail..."
            />
            {errors.workCompleted && <Text className="text-red-500 text-xs -mt-4 mb-3">{errors.workCompleted}</Text>}

            {/* Worker count */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Workers Present</Text>
            <TextInput
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50"
              keyboardType="number-pad"
              value={workerCount}
              onChangeText={setWorkerCount}
              placeholder="Number of workers on site today"
            />

            {/* Blockers / Issues */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Blockers / Issues</Text>
            <TextInput
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[80px]"
              multiline
              textAlignVertical="top"
              value={blockers}
              onChangeText={setBlockers}
              placeholder="Any blockers, safety issues, or delays? Leave blank if none."
            />

            {/* Photos */}
            <Text className="text-sm font-bold text-gray-700 mb-1">Photos</Text>
            {photoUrls.map((url, i) => (
              <View key={i} className="flex-row items-center bg-blue-50 rounded-lg p-2 mb-2">
                <Ionicons name="image-outline" size={14} color="#3B82F6" />
                <Text className="text-blue-700 text-xs ml-2 flex-1" numberOfLines={1}>{url}</Text>
                <Pressable onPress={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={uploadPhoto}
              disabled={photoUploading}
              className="border border-dashed border-gray-300 rounded-xl py-4 items-center mb-6"
            >
              {photoUploading ? (
                <ActivityIndicator color="#F97316" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={24} color="#9CA3AF" />
                  <Text className="text-gray-500 text-sm mt-2">Tap to attach photo</Text>
                </>
              )}
            </Pressable>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              className={`py-4 rounded-xl items-center ${loading ? 'bg-orange-300' : 'bg-brand-orange'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Submit Report</Text>
              )}
            </Pressable>

          </View>
        </ScrollView>
      )}
    </View>
  );
}
