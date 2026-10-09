import { getApiUrl } from '../../../../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { MilestoneRow } from '@/components/common/MilestoneRow';
import { useResponsive } from '@/hooks/useResponsive';

export default function AdminMilestonesIndexPage() {
  const { isMobile } = useResponsive();
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);

  const fetchMilestones = async () => {
    try {
      setLoading(true);

      // Fetch project name for header
      if (!project) {
        const { data: pData } = await supabase.from('projects').select('name').eq('id', projectId).single();
        if (pData) setProject(pData);
      }

      const { data, error } = await supabase
        .from('milestones')
        .select('*, milestone_media(*)')
        .eq('project_id', projectId)
        .order('due_date', { ascending: true });

      if (error) throw error;
      setMilestones(data || []);
    } catch (err: any) {
      Alert.alert("Error fetching milestones", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchMilestones();
  }, [projectId]);

  const markComplete = async (milestoneId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${getApiUrl()}/projects/${projectId}/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`
        },
        body: JSON.stringify({ status: 'Completed' })
      });
      if (!response.ok) throw new Error("Failed to update milestone");

      fetchMilestones();
      Alert.alert("Success", "Milestone marked as complete!");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav
        title={project ? `${project.name} - Milestones` : "Project Milestones"}
        actionLabel="+ Add Milestone"
        onActionPress={() => router.push(`/admin/projects/${projectId}/milestones/create`)}
      />

      <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'p-4' : 'p-6'}`}>
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
                  onPress={() => router.push(`/admin/projects/${projectId}/milestones/create`)}
                  className="mt-6 bg-brand-orange px-6 py-3 rounded-xl shadow-sm"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Create First Milestone</Text>
                </Pressable>
              </View>
            ) : (
              <View className={`bg-white rounded-3xl shadow-sm border border-gray-100 ${isMobile ? 'p-4' : 'p-8'}`}>
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
