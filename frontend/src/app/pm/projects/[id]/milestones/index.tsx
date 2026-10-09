import { api } from '@/services/api';
import { notify } from '@/utils/notify';
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { MilestoneRow } from '@/components/common/MilestoneRow';
import { useResponsive } from '@/hooks/useResponsive';

export default function PMMilestonesIndexPage() {
  const { isMobile } = useResponsive();
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);

  const [saving, setSaving] = useState(false);
  const fetchMilestones = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch project name for header
      {
        const { data: pData, error: projectError } = await supabase.from('projects').select('name').eq('id', projectId).single();
        if (projectError) throw projectError;
        setProject(pData);
      }

      const { data, error } = await supabase
        .from('milestones')
        .select('*, milestone_media(*)')
        .eq('project_id', projectId)
        .order('due_date', { ascending: true });

      if (error) throw error;
      setMilestones(data || []);
    } catch (err: any) {
      notify("Error fetching milestones", err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    if (projectId) void fetchMilestones();
  }, [projectId, fetchMilestones]));

  const markComplete = async (milestoneId: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.projects.updateMilestone(String(projectId), milestoneId, { status: 'Completed', completion_percentage: 100 });
      await fetchMilestones();
      notify("Success", "Milestone marked as complete!");
    } catch (err: any) {
      notify("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav
        showBackButton
        title={project ? `${project.name} - Milestones` : "Project Milestones"}
        actionLabel="+ Add Milestone"
        onActionPress={() => router.push(`/pm/projects/${projectId}/milestones/create`)}
      />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'p-4' : 'p-4 md:p-6'}`}>
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">
            <View className="flex-row justify-between items-center mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Timeline Tracking</Text>
            </View>

            {milestones.length === 0 ? (
              <View className="bg-white rounded-2xl p-10 items-center justify-center border border-gray-100 shadow-sm">
                <Ionicons name="flag-outline" size={48} color="#D1D5DB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 text-center font-medium">No milestones created for this project yet.</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => router.push(`/pm/projects/${projectId}/milestones/create`)}
                  className="mt-6 bg-brand-orange px-6 py-3 rounded-xl shadow-sm"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Create First Milestone</Text>
                </Pressable>
              </View>
            ) : (
              <View className={`bg-white rounded-3xl shadow-sm border border-gray-100 ${isMobile ? 'p-4' : 'p-4 md:p-8'}`}>
                {milestones.map((ms, idx) => (
                  <MilestoneRow 
                    key={ms.id} 
                    ms={ms} 
                    isLast={idx === milestones.length - 1}
                    onMarkComplete={markComplete}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
