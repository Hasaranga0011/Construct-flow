import { dataError } from '@/services/siteData';
import { notify } from '@/utils/notify';
import { ModalViewport } from '@/components/common/ModalViewport';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Platform, Modal, Image, Linking } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../services/api';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';
import { pickSitePhoto } from '@/services/sitePhoto';
import { MilestoneRow } from '@/components/common/MilestoneRow';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
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
      setLoadError('');

      const { data: projectsData, error: projectsDataError } = assignedProjectIds.length
        ? await supabase.from('projects').select('id, name').in('id', assignedProjectIds)
        : { data: [], error: null };
      if (projectsDataError) throw projectsDataError;

      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      const currentProject = parsedProjects.some(p => p.id === activeProjectId) ? activeProjectId : parsedProjects[0]?.id || null;
      if (activeProjectId !== currentProject) setActiveProjectId(currentProject);

      if (currentProject) {
        const { data: msData, error: msDataError } = await supabase
          .from('milestones')
          .select('*, milestone_media(id, url)')
          .eq('project_id', currentProject)
          .order('due_date', { ascending: true });
      if (msDataError) throw msDataError;

        setMilestones(msData || []);
      }
    } catch (error) {
      setLoadError(dataError(error));
    } finally {
      setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, activeProjectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenModal = (ms: Milestone) => {
    setSelectedMilestone(ms);
    setCompletion(String(ms.completion_percentage || 0));
    setNotes(ms.description || '');
    setPhotoUrl(null);
  };

  const handleUploadPhoto = async () => {
    if (!activeProjectId || uploading || submitting) return;
    setUploading(true);
    try {
      const url = await pickSitePhoto(activeProjectId, 'Milestone update');
      if (url) setPhotoUrl(url);
    } catch (error: any) { notify('Upload failed', error.message); }
    finally { setUploading(false); }
  };

  const handleSubmitUpdate = async () => {
    if (submitting || uploading || !selectedMilestone || !activeProjectId) return;
    const value = Number(completion);
    if (!completion.trim() || !Number.isFinite(value) || value < 0 || value > 100) {
      notify('Invalid', 'Completion must be between 0 and 100.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update the milestone
      await api.projects.updateMilestone(activeProjectId, selectedMilestone.id, {
        completion_percentage: value,
        description: notes.trim(),
        status: value >= 100 ? 'Completed' : value > 0 ? 'In Progress' : 'Pending'
      });

      // 2. Insert media/notes if provided
      if (photoUrl) {
        const { error: mediaError } = await supabase
          .from('milestone_media')
          .insert({
            milestone_id: selectedMilestone.id,
            uploaded_by: user?.id,
            url: photoUrl
          });
        if (mediaError) throw new Error(`Progress saved, but photo could not be attached: ${mediaError.message}`);
      }

      toast('Progress updated successfully');
      setSelectedMilestone(null);
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to update milestone');
    } finally {
      setSubmitting(false);
    }
  };

  const toast = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else notify('Success', msg);
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
      <TopNav title="Project Milestones" actionLabel="Refresh" onActionPress={() => { loadData(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

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
              <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {projects.map(p => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={p.id}
                    onPress={() => setActiveProjectId(p.id)}
                    className={`mr-6 pb-3 border-b-2 ${activeProjectId === p.id ? 'border-brand-orange' : 'border-transparent'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeProjectId === p.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'p-4' : 'p-6'}`}>
            {milestones.length === 0 ? (
              <View className="bg-white p-10 rounded-2xl items-center border border-gray-100 shadow-sm mt-4">
                <Ionicons name="flag-outline" size={48} color="#D1D5DB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 text-center font-medium">No milestones found for this project.</Text>
              </View>
            ) : (
              <View className={`bg-white rounded-3xl shadow-sm border border-gray-100 ${isMobile ? 'p-4 mt-4' : 'p-8 mt-4'}`}>
                {milestones.map((ms, idx) => (
                  <MilestoneRow 
                    key={ms.id} 
                    ms={ms} 
                    isLast={idx === milestones.length - 1}
                    showAction={false}
                  >
                    <View className="mt-4 mb-2">
                      <View className="flex-row justify-between mb-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-500">Progress</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-text">{ms.completion_percentage || 0}%</Text>
                      </View>
                      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <View
                          className="h-full bg-brand-orange rounded-full"
                          style={{ width: `${ms.completion_percentage || 0}%` }}
                        />
                      </View>
                    </View>

                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => handleOpenModal(ms)}
                      className="bg-brand-light border border-gray-200 py-3 rounded-xl items-center flex-row justify-center mt-2 w-full"
                    >
                      <Ionicons name="create-outline" size={18} color="#4B5563" style={{ marginRight: 8 }} />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold">Update Progress</Text>
                    </Pressable>
                  </MilestoneRow>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {selectedMilestone && (
        <Modal transparent animationType="fade" onRequestClose={() => !submitting && !uploading && setSelectedMilestone(null)}>
          <ModalViewport>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-full">
              <View className="flex-row justify-between items-center mb-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Update Milestone</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => !submitting && !uploading && setSelectedMilestone(null)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </Pressable>
              </View>

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Completion Percentage (%)</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                value={completion}
                onChangeText={setCompletion}
                keyboardType="numeric"
                placeholder="e.g. 50"
                className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4 text-brand-text font-bold"
              />

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Notes / Update Summary</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                value={notes}
                onChangeText={setNotes}
                placeholder="What was completed?"
                multiline
                className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4 h-24 text-brand-text"
              />

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-700 mb-2">Photo Proof (Optional)</Text>
              {photoUrl ? (
                <View className="relative h-32 rounded-xl overflow-hidden mb-6 border border-gray-200">
                  <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => setPhotoUrl(null)}
                    className="absolute top-2 right-2 bg-black/50 rounded-full p-1"
                  >
                    <Ionicons name="close" size={16} color="white" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={handleUploadPhoto}
                  disabled={uploading}
                  className="border border-dashed border-gray-300 rounded-xl py-6 items-center mb-6 bg-gray-50"
                >
                  {uploading ? (
                    <ActivityIndicator color="#F97316" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={24} color="#9CA3AF" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-2 font-semibold text-sm">Upload Photo</Text>
                    </>
                  )}
                </Pressable>
              )}

              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleSubmitUpdate}
                disabled={submitting || uploading}
                className="bg-brand-orange py-4 rounded-xl items-center shadow-sm"
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Submit Update</Text>
                )}
              </Pressable>
            </ScrollView>
          </ModalViewport>
        </Modal>
      )}
    </View>
  );
}
