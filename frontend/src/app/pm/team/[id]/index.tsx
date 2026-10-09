import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '@/utils/notify';

export default function PMTeamMemberViewPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      try {
        if (!user) return;
        // 1. Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (profileError) throw profileError;

        // 2. Fetch projects this user is assigned to AND that this PM manages
        const { data: assignments, error: assignError } = await supabase
          .from('project_role_assignments')
          .select(`
            project_id,
            projects!inner ( id, name, status, pm_id )
          `)
          .eq('user_id', id)
          .eq('projects.pm_id', user.id);

        if (assignError) throw assignError;

        if (isMounted) {
          setMember(profile);
          setProjects(assignments?.map(a => a.projects) || []);
        }
      } catch (err: any) {
        if (isMounted) notify('Error', err.message || 'Failed to load member details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    if (id) fetchDetails();
    return () => { isMounted = false; };
  }, [id, user]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={member?.full_name || 'Team Member'} showAction={false} />
      
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : !member ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-lg">Member not found.</Text>
          <Pressable onPress={() => router.back()} className="mt-4 p-3 bg-brand-orange rounded-xl">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Go Back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
          <View className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-gray-100">
            <View className="flex-row items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-brand-orange items-center justify-center mr-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-2xl font-bold uppercase">
                  {(member.full_name || 'U').charAt(0)}
                </Text>
              </View>
              <View className="flex-1">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-1">
                  {member.full_name || 'Unnamed Member'}
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold uppercase text-xs tracking-wider">
                  {(member.role || 'team member').replace('_', ' ')}
                </Text>
              </View>
            </View>

            <View className="space-y-4">
              <View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-400 mb-1">Email Address</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg text-gray-800">{member.email || 'Not provided'}</Text>
              </View>
              
              <View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-400 mb-1">Contact Number</Text>
                <View className="flex-row items-center justify-between">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg text-gray-800">{member.contact_number || 'Not provided'}</Text>
                  {member.contact_number && (
                    <Pressable onPress={() => Linking.openURL(`tel:${member.contact_number}`)} className="bg-orange-50 p-2 rounded-full">
                      <Ionicons name="call" size={20} color="#F97316" />
                    </Pressable>
                  )}
                </View>
              </View>

              {member.role === 'worker' && (
                <>
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-400 mb-1">Worker Type</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg text-gray-800">{member.worker_type || 'General'}</Text>
                  </View>
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-400 mb-1">Daily Rate</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg text-gray-800">
                      {member.daily_rate ? `Rs. ${member.daily_rate}` : 'Not set'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mb-4">Assigned Projects (Managed by you)</Text>
          {projects.length === 0 ? (
            <View className="bg-white rounded-xl p-8 items-center justify-center border border-gray-100">
              <Ionicons name="folder-open-outline" size={32} color="#D1D5DB" className="mb-2" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center">
                This member is not assigned to any projects you manage.
              </Text>
            </View>
          ) : (
            projects.map(project => (
              <Pressable 
                key={project.id}
                onPress={() => router.push(`/pm/projects/${project.id}` as any)}
                className="bg-white rounded-xl p-5 mb-3 border border-gray-100 shadow-sm flex-row justify-between items-center active:opacity-70"
              >
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg text-gray-900">{project.name}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1 capitalize">{project.status}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
            ))
          )}
          
          <View className="h-10" />
        </ScrollView>
      )}
    </View>
  );
}
