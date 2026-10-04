import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function AdminMilestonesIndexPage() {
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects/${projectId}/milestones/${milestoneId}`, {
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
      
      <ScrollView className="flex-1 p-6">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">Timeline Tracking</Text>
            </View>

            {milestones.length === 0 ? (
              <View className="bg-white rounded-2xl p-10 items-center justify-center border border-gray-100 shadow-sm">
                <Ionicons name="flag-outline" size={48} color="#D1D5DB" />
                <Text className="text-gray-400 mt-4 text-center font-medium">No milestones created for this project yet.</Text>
                <Pressable 
                  onPress={() => router.push(`/admin/projects/${projectId}/milestones/create`)}
                  className="mt-6 bg-brand-orange px-6 py-3 rounded-xl shadow-sm"
                >
                  <Text className="text-white font-bold">Create First Milestone</Text>
                </Pressable>
              </View>
            ) : (
              <View className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                {milestones.map((ms, idx) => (
                  <View key={ms.id} className={`flex-row ${idx !== milestones.length - 1 ? 'border-b border-gray-100 mb-6 pb-6' : ''}`}>
                    <View className="mr-6 items-center">
                      <View className={`w-11 h-11 rounded-full items-center justify-center ${ms.status === 'Completed' ? 'bg-green-100' : 'bg-orange-100'}`}>
                        <Ionicons name={ms.status === 'Completed' ? "checkmark" : "time"} size={20} color={ms.status === 'Completed' ? "#16A34A" : "#EA580C"} />
                      </View>
                      {idx !== milestones.length - 1 && (
                        <View className="w-0.5 h-full bg-gray-100 mt-2" />
                      )}
                    </View>
                    
                    <View className="flex-1 pt-1">
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-4">
                          <Text className="text-xl font-bold text-gray-800">{ms.title}</Text>
                          <Text className="text-gray-500 text-sm mt-1 mb-3">{ms.description}</Text>
                        </View>
                        <View className={`px-3 py-1.5 rounded-lg ${ms.status === 'Completed' ? 'bg-[#DCFCE7]' : 'bg-orange-50'}`}>
                           <Text className={`text-xs font-bold uppercase tracking-wider ${ms.status === 'Completed' ? 'text-green-600' : 'text-orange-600'}`}>{ms.status}</Text>
                        </View>
                      </View>
                      
                      <View className="flex-row items-center justify-between mt-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                         <View className="flex-row items-center">
                           <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2" />
                           <Text className="text-sm font-bold text-gray-600">Target Date: {new Date(ms.due_date).toDateString()}</Text>
                         </View>
                         
                         {ms.status !== 'Completed' && (
                           <Pressable 
                             onPress={() => markComplete(ms.id)}
                             className="bg-[#DCFCE7] border border-[#BBF7D0] min-h-[44px] justify-center px-4 rounded-lg shadow-sm active:bg-[#BBF7D0]"
                           >
                             <Text className="text-[#15803D] text-sm font-bold">Mark Complete</Text>
                           </Pressable>
                         )}
                      </View>
                      
                      {/* Media Display */}
                      {ms.milestone_media && ms.milestone_media.length > 0 && (
                        <View className="flex-row flex-wrap mt-4">
                           {ms.milestone_media.map((media: any) => (
                              <View key={media.id} className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden mr-3 mb-3 border border-gray-200">
                                <View className="flex-1 items-center justify-center">
                                   <Ionicons name="image" size={28} color="#D1D5DB" />
                                </View>
                              </View>
                           ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
