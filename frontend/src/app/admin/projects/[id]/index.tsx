import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function AdminProjectDetailsPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    console.log("AdminProjectDetailsPage mounted with ID:", id);
    const fetchProject = async () => {
      try {
        if (!id) {
            console.error("ID is undefined!");
            if (isMounted) setLoading(false);
            return;
        }
        
        const { data: projData, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .single();
          
        if (projError) {
          console.error("Supabase Error:", projError);
          throw projError;
        }

        // Fetch relations manually to avoid PostgREST foreign key ambiguity
        if (projData.pm_id) {
            const { data: pmData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.pm_id).single();
            projData.pm = pmData;
        }
        
        if (projData.client_id) {
            const { data: clientData } = await supabase.from('profiles').select('full_name, role').eq('id', projData.client_id).single();
            projData.client = clientData;
        }
        
        console.log("Fetched Project:", projData);
        if (isMounted) setProject(projData);
      } catch (err: any) {
        console.error('Error fetching project details', err);
        alert(`Error fetching project details: ${err.message || JSON.stringify(err)} | ID: ${id}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchProject();
    return () => { isMounted = false; };
  }, [id]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={project ? project.name : "Project Details"} showAction={false} />
      
      <ScrollView className="flex-1 p-6">
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : !project ? (
          <View className="py-20 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
            <Text className="text-gray-400 text-lg font-medium">Project not found.</Text>
          </View>
        ) : (
          <View className="max-w-4xl mx-auto w-full">
            
            {/* Header Card */}
            <View className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6 relative overflow-hidden">
              <View className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full" />
              
              <View className="flex-row justify-between items-start mb-6">
                <View className="flex-1 pr-6">
                  <Text className="text-3xl font-black text-gray-800 mb-2">{project.name}</Text>
                  <View className="flex-row items-center">
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <Text className="text-gray-500 ml-1">{project.location}</Text>
                  </View>
                </View>
                
                <View className={`px-4 py-2 rounded-lg ${project.status === 'active' ? 'bg-[#DCFCE7]' : 'bg-gray-100'}`}>
                  <Text className={`font-bold uppercase tracking-wider ${project.status === 'active' ? 'text-brand-success' : 'text-gray-600'}`}>
                    {project.status}
                  </Text>
                </View>
              </View>
              
              {/* Stats Row */}
              <View className="flex-row justify-between pt-6 border-t border-gray-100">
                <View>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Total Budget</Text>
                  <Text className="text-xl font-bold text-gray-800">
                    Rs. {project.total_budget?.toLocaleString() || 'N/A'}
                  </Text>
                </View>
                <View>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Start Date</Text>
                  <Text className="text-lg font-medium text-gray-800">
                    {new Date(project.start_date).toDateString()}
                  </Text>
                </View>
                <View>
                  <Text className="text-gray-400 text-xs uppercase font-bold mb-1">Target End</Text>
                  <Text className="text-lg font-medium text-gray-800">
                    {new Date(project.end_date).toDateString()}
                  </Text>
                </View>
              </View>
            </View>
            
            <View className="flex-row space-x-6">
              {/* Personnel Details */}
              <View className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Assigned Personnel</Text>
                
                <View className="mb-4 flex-row items-center">
                  <View className="w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={20} color="#3B82F6" />
                  </View>
                  <View>
                    <Text className="text-xs text-gray-400 font-bold uppercase">Project Manager</Text>
                    <Text className="text-gray-800 font-medium">{project.pm?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>
                
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-purple-50 rounded-full items-center justify-center mr-3">
                    <Ionicons name="person" size={20} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text className="text-xs text-gray-400 font-bold uppercase">Client</Text>
                    <Text className="text-gray-800 font-medium">{project.client?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>
              </View>

              {/* Quick Actions */}
              <View className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                 <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Quick Actions</Text>
                 
                 <TouchableOpacity 
                    onPress={() => router.push(`/admin/projects/${project.id}/milestones`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl mb-3 border border-gray-200"
                 >
                    <Ionicons name="flag" size={20} color="#F97316" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800">Manage Milestones</Text>
                      <Text className="text-xs text-gray-500">Track project phases & media</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    onPress={() => router.push(`/admin/projects/${project.id}/edit`)}
                    className="flex-row items-center p-3 bg-gray-50 rounded-xl border border-gray-200"
                 >
                    <Ionicons name="settings" size={20} color="#3B82F6" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800">Edit Project</Text>
                      <Text className="text-xs text-gray-500">Update budget & details</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                 </TouchableOpacity>
              </View>
            </View>

          </View>
        )}
      </ScrollView>
    </View>
  );
}
