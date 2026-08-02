import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function SMTeamPage() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Assignment Modal
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      const userId = sessionData.session.user.id;
      setCurrentUserId(userId);

      // 1. Fetch SM's assigned sites
      const { data: smSites } = await supabase
        .from('site_manager_sites')
        .select('site_id, sites(name, location)')
        .eq('site_manager_id', userId);
        
      const parsedSites = smSites?.map(s => ({ id: s.site_id, name: s.sites?.name, location: s.sites?.location })) || [];
      setSites(parsedSites);

      if (parsedSites.length > 0) {
        const siteIds = parsedSites.map(s => s.id);
        
        // 2. Fetch workers assigned to these sites
        const { data: assignData, error: assignErr } = await supabase
          .from('site_workers')
          .select('*, profiles:worker_id(id, full_name)')
          .in('site_id', siteIds);
        if (assignErr) throw assignErr;
        setWorkers(assignData || []);
      }

      // 3. Fetch all workers in the system (Mock QR Scanner Database)
      const { data: workerProfiles, error: workerErr } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'worker');
      if (workerErr) throw workerErr;
      setAvailableWorkers(workerProfiles || []);

    } catch (error: any) {
      console.error('Error fetching team data', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, []);

  const handleMockScanQR = async (workerId: string) => {
    if (!selectedSiteId || !currentUserId) return;
    try {
      const { error } = await supabase
        .from('site_workers')
        .insert({
          site_id: selectedSiteId,
          worker_id: workerId,
          site_manager_id: currentUserId
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Notice', 'This Worker is already assigned to this site.');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Success', 'Worker scanned and assigned successfully!');
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
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
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
                const siteWorkers = workers.filter(w => w.site_id === site.id);

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
                        <Ionicons name="hard-hat-outline" size={32} color="#9CA3AF" />
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

      {/* Mock QR Scanner Modal */}
      <Modal visible={isAssigning} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white w-full rounded-t-3xl overflow-hidden shadow-2xl h-3/4">
            <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-gray-50">
              <View className="flex-row items-center">
                <Ionicons name="qr-code-outline" size={24} color="#F97316" />
                <Text className="text-xl font-bold text-gray-800 ml-3">Simulate QR Scan</Text>
              </View>
              <Pressable onPress={() => setIsAssigning(false)} className="p-2 bg-gray-200 rounded-full">
                <Ionicons name="close" size={20} color="#4B5563" />
              </Pressable>
            </View>
            
            <View className="p-8 flex-1">
              <Text className="text-gray-600 mb-6 text-center">
                In a real application, this would open the device camera to scan the Worker's unique QR code. 
                For this simulator, please select a worker from the database to assign them.
              </Text>

              {availableWorkers.length === 0 ? (
                <Text className="text-gray-400 italic text-center">No Workers found in the database.</Text>
              ) : (
                <ScrollView className="flex-1 border border-gray-200 rounded-xl bg-gray-50 p-2">
                  {availableWorkers.map((worker) => (
                    <Pressable 
                      key={worker.id} 
                      onPress={() => handleMockScanQR(worker.id)}
                      className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-white rounded-lg mb-2 shadow-sm active:bg-orange-50"
                    >
                      <View className="flex-row items-center">
                        <Ionicons name="id-card-outline" size={24} color="#6B7280" className="mr-3" />
                        <View>
                          <Text className="text-gray-800 font-bold text-base">{worker.full_name || 'Unnamed Worker'}</Text>
                          <Text className="text-gray-400 text-xs">UUID: {worker.id.slice(0, 13)}...</Text>
                        </View>
                      </View>
                      <View className="bg-brand-orange px-3 py-1.5 rounded-full">
                        <Text className="text-white text-xs font-bold">Assign</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
