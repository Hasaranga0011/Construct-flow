import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { QRScanner } from '@/components/worker/QRScanner';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

export default function SMTeamPage() {
  const { user } = useAuth();
  const { assignedProjectIds, assignments, loading: sitesLoading } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);

  // Assignment Modal
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const fetchTeamData = async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);

      if (assignedProjectIds.length > 0) {
        const { data: projectsData } = await supabase
          .from('projects')
          .select('id, name, location')
          .in('id', assignedProjectIds);

        const parsedSites = projectsData?.map((p: any) => {
          const assignment = assignments.find((a: any) => a.projectId === p.id);
          return { id: p.id, siteId: assignment?.assignmentId, name: p.name, location: p.location };
        }) || [];
        setSites(parsedSites);
        
        // 2. Fetch workers assigned to these projects
        const { data: assignData, error: assignErr } = await supabase
          .from('site_workers')
          .select('*, profiles!inner(id, full_name)')
          .in('project_id', assignedProjectIds);
        if (assignErr) throw assignErr;
        setWorkers(assignData || []);
      }

    } catch (error: any) {
      console.error('Error fetching team data', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [user?.id, sitesLoading, assignedProjectIds, assignments]);

  const handleScanQR = async (qrCode: string) => {
    if (!selectedSiteId || !user?.id) return;
    try {
      const { data: worker, error: workerError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'worker')
        .eq('qr_code', qrCode)
        .single();
      if (workerError) throw workerError;

      const { error } = await supabase
        .from('site_workers')
        .insert({
          project_id: selectedSiteId,
          worker_id: worker.id,
          site_manager_id: user.id
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Notice', 'This Worker is already assigned to this site.');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Success', `${worker.full_name || 'Worker'} assigned successfully!`);
        setIsAssigning(false);
        setSelectedSiteId(null);
        fetchTeamData();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemoveWorker = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('site_workers')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
      fetchTeamData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <TopNav title="Worker Management" />
      
      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>
          
          <View className="mb-6 flex-row justify-between items-center">
            <Text className="text-2xl font-bold text-gray-800">Assigned Site Workers</Text>
          </View>

          {sites.length === 0 ? (
            <View className="bg-white p-12 rounded-xl border border-gray-200 items-center justify-center shadow-sm">
              <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium text-center">You have no assigned sites.</Text>
              <Text className="text-gray-400 text-sm mt-2 text-center">Please contact your Project Manager for site assignments.</Text>
            </View>
          ) : (
          <View className="space-y-6">
              {sites.map(site => {
                const siteWorkers = workers.filter(w => w.project_id === site.id);

                return (
                  <View key={site.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-4">
                      <View>
                        <Text className="text-xl font-bold text-gray-800">{site.name}</Text>
                        <Text className="text-gray-500 text-sm">{site.location || 'Unknown Location'}</Text>
                      </View>
                      
                      <Pressable 
                        onPress={() => {
                          setSelectedSiteId(site.id);
                          setIsAssigning(true);
                        }}
                        className="bg-brand-orange px-4 py-2 rounded-lg flex-row items-center"
                      >
                        <Ionicons name="qr-code-outline" size={16} color="white" className="mr-2" />
                        <Text className="text-white font-bold ml-2">Scan Worker QR</Text>
                      </Pressable>
                    </View>

                    {siteWorkers.length === 0 ? (
                      <View className="py-8 items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <Ionicons name="construct-outline" size={32} color="#9CA3AF" />
                        <Text className="text-gray-400 mt-2 text-sm">No workers currently assigned to this site.</Text>
                      </View>
                    ) : (
                      <View className="space-y-3 mt-2">
                        <View className="flex-row py-2 px-4 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                          <Text className="flex-[2] text-xs font-bold text-gray-500 uppercase">Worker Name</Text>
                          <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Status</Text>
                          <Text className="w-20 text-xs font-bold text-gray-500 uppercase text-right">Actions</Text>
                        </View>
                        {siteWorkers.map((worker) => (
                          <View key={worker.id} className="flex-row items-center p-4 bg-white border border-gray-100 rounded-lg hover:bg-gray-50">
                            <View className="flex-[2] flex-row items-center">
                              <View className="w-8 h-8 bg-orange-100 rounded-full items-center justify-center mr-3">
                                <Ionicons name="person" size={14} color="#F97316" />
                              </View>
                              <Text className="text-gray-800 font-bold">{worker.profiles?.full_name || 'Unknown Worker'}</Text>
                            </View>
                            
                            <View className="flex-1">
                              <Text className="text-green-600 text-xs font-bold bg-green-100 px-2 py-1 rounded self-start">Active</Text>
                            </View>

                            <View className="w-20 items-end">
                              <Pressable onPress={() => handleRemoveWorker(worker.id)}>
                                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {isAssigning && <QRScanner onScan={handleScanQR} onClose={() => setIsAssigning(false)} />}

    </View>
  );
}
