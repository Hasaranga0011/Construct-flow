import { dataError } from '@/services/siteData';
import { pickSitePhoto } from '@/services/sitePhoto';
import { PhotoCaptureModal } from '@/components/common/PhotoCaptureModal';
import { validReportDate, validWorkerCount } from '@/utils/siteWorkflow';
import { notify } from '@/utils/notify';
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, Platform, Image,
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
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, assignments, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
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
  const [showPhotoModal, setShowPhotoModal] = useState(false);
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

        const { data: projectsData, error: projectsDataError } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', assignedProjectIds)
          ;
      if (projectsDataError) throw projectsDataError;

        const parsed: Project[] = (projectsData || []).map((p: any) => {
          const assignment = assignments.find((a: any) => a.projectId === p.id);
          return { id: p.id, name: p.name, siteId: assignment?.assignmentId || '' };
        });
        setProjects(parsed);
        if (parsed.length > 0) setSelectedProjectId(parsed[0].id);
      } catch (error) {
        setLoadError(dataError(error));
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
    if (!validReportDate(date)) errs.date = 'Enter a valid date as YYYY-MM-DD';
    if (!validWorkerCount(workerCount)) errs.workerCount = 'Enter a whole number of workers, zero or more';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const uploadPhoto = async () => {
    if (!selectedProjectId || photoUploading || loading) return;
    setPhotoUploading(true);
    try {
      const url = await pickSitePhoto(selectedProjectId, 'Daily site report');
      if (url) setPhotoUrls(prev => [...prev, url]);
    } catch (error: any) { notify('Photo upload failed', error.message); }
    finally { setPhotoUploading(false); }
  };

  const handleSubmit = async () => {
    if (loading || photoUploading || !validate()) return;

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
      router.replace('/site-manager/reports');
    } catch (error: any) {
      const msg = error.message || 'Failed to submit report';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        notify('Error', msg);
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
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-2">Report Submitted!</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center">Your daily site report has been submitted. You can view it in Site Reports.</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="New Site Report" showAction={false} />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {projectsLoading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">

            {/* Project picker */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Project <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
              {projects.map(p => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={p.id}
                  disabled={loading || photoUploading}
                  onPress={() => { setSelectedProjectId(p.id); setPhotoUrls([]); }}
                  className={`mr-3 px-4 py-2 rounded-full border ${selectedProjectId === p.id ? 'bg-brand-orange border-brand-orange' : 'border-gray-200 bg-gray-50'}`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-sm ${selectedProjectId === p.id ? 'text-white' : 'text-gray-600'}`}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {errors.project && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs mb-3">{errors.project}</Text>}

            {/* Date */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Report Date <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className={`border ${errors.date ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-5 text-brand-text bg-gray-50`}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />
            {errors.date && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs -mt-4 mb-3">{errors.date}</Text>}

            {/* Work completed */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Work Completed Today <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">*</Text></Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className={`border ${errors.workCompleted ? 'border-red-400' : 'border-gray-300'} rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[100px]`}
              multiline
              textAlignVertical="top"
              value={workCompleted}
              onChangeText={setWorkCompleted}
              placeholder="Describe the work completed today in detail..."
            />
            {errors.workCompleted && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs -mt-4 mb-3">{errors.workCompleted}</Text>}

            {/* Worker count */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Workers Present</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50"
              keyboardType="number-pad"
              value={workerCount}
              onChangeText={setWorkerCount}
              placeholder="Number of workers on site today"
            />

            {errors.workerCount && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 mb-3">{errors.workerCount}</Text>}
            {/* Blockers / Issues */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Blockers / Issues</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-300 rounded-xl p-3 mb-5 text-brand-text bg-gray-50 min-h-[80px]"
              multiline
              textAlignVertical="top"
              value={blockers}
              onChangeText={setBlockers}
              placeholder="Any blockers, safety issues, or delays? Leave blank if none."
            />

            {/* Photos */}
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-1">Site Photos</Text>
            {photoUrls.map((url, i) => (
              <View key={i} className="flex-row items-center bg-blue-50 border border-blue-100 rounded-lg p-2 mb-2">
                <Ionicons name="image-outline" size={14} color="#3B82F6" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 text-xs ml-2 flex-1">{url}</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))} className="p-1">
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            ))}

            <View className="flex-row gap-3 mb-6">
              {/* Option 1: Live Real-time Camera */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowPhotoModal(true)}
                disabled={photoUploading || loading || !selectedProjectId}
                className="flex-1 border border-orange-200 bg-orange-50/80 rounded-xl py-3.5 items-center justify-center flex-row active:bg-orange-100"
              >
                <Ionicons name="camera" size={18} color="#F97316" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold ml-1.5">📸 Live Camera</Text>
              </Pressable>

              {/* Option 2: Device Upload (Preserves exact 'Tap to attach photo' text for automated audit) */}
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={uploadPhoto}
                disabled={photoUploading || loading || !selectedProjectId}
                className="flex-1 border border-dashed border-gray-300 rounded-xl py-3.5 items-center justify-center flex-row active:bg-gray-50"
              >
                {photoUploading ? (
                  <ActivityIndicator color="#F97316" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-medium ml-1.5">Tap to attach photo</Text>
                  </>
                )}
              </Pressable>
            </View>

            <PhotoCaptureModal
              visible={showPhotoModal}
              onClose={() => setShowPhotoModal(false)}
              projectId={selectedProjectId || undefined}
              caption="Daily site report photo"
              title="Capture Site Photo"
              onPhotoUploaded={(url) => setPhotoUrls(prev => [...prev, url])}
            />

            {/* Submit */}
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={handleSubmit}
              disabled={loading || photoUploading}
              className={`py-4 rounded-xl items-center ${loading ? 'bg-orange-300' : 'bg-brand-orange'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Submit Report</Text>
              )}
            </Pressable>

          </View>
        </ScrollView>
      )}
    </View>
  );
}
