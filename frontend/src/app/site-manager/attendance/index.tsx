import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function SMAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  
  const [siteWorkers, setSiteWorkers] = useState<any[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  
  // A helper function to get today's date string (YYYY-MM-DD) for predictable DB inserts
  const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0] + "T00:00:00Z";
  };

  const fetchAttendanceData = async () => {
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
        // Set first site as active if none selected
        const currentSite = activeSiteId || parsedSites[0].id;
        if (!activeSiteId) setActiveSiteId(currentSite);

        // 2. Fetch workers assigned to the active site
        const { data: workersData } = await supabase
          .from('site_workers')
          .select('worker_id, profiles:worker_id(full_name, qr_code)')
          .eq('site_id', currentSite);
        
        setSiteWorkers(workersData || []);

        // 3. Fetch today's attendance for the active site
        const todayStr = getTodayDateString();
        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('*')
          .eq('site_id', currentSite)
          .eq('date', todayStr);

        setTodayAttendance(attendanceData || []);
      }
    } catch (error: any) {
      console.error('Error fetching attendance data', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, [activeSiteId]);

  const markAttendance = async (qrCode: string) => {
    if (!activeSiteId) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/labour/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          qr_code: qrCode,
          site_id: activeSiteId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Scan failed');
      }

      fetchAttendanceData(); // Refresh list
      Alert.alert('Success', `${result.worker_name} ${result.action === 'check_in' ? 'Clocked In' : 'Clocked Out'}!`);
      if (isScanning) setIsScanning(false);
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const getAttendanceStatus = (workerId: string) => {
    const record = todayAttendance.find(a => a.worker_id === workerId);
    return record ? record.status : 'Pending';
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Daily Attendance" />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <View className="flex-1">
          {sites.length === 0 ? (
            <View className="flex-1 items-center justify-center p-8">
              <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium text-center">You have no assigned sites.</Text>
            </View>
          ) : (
            <>
              {/* Site Selector Tabs */}
              <View className="bg-white px-6 pt-4 border-b border-gray-200">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {sites.map(site => (
                    <Pressable 
                      key={site.id}
                      onPress={() => setActiveSiteId(site.id)}
                      className={`mr-6 pb-3 border-b-2 ${activeSiteId === site.id ? 'border-brand-orange' : 'border-transparent'}`}
                    >
                      <Text className={`font-bold text-base ${activeSiteId === site.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                        {site.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>
                
                <View className="flex-row justify-between items-center mb-6">
                  <View>
                    <Text className="text-2xl font-bold text-gray-800">Today's Attendance</Text>
                    <Text className="text-gray-500">{new Date().toDateString()}</Text>
                  </View>
                  
                  <Pressable 
                    onPress={() => setIsScanning(true)}
                    className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
                  >
                    <Ionicons name="qr-code-outline" size={20} color="white" className="mr-2" />
                    <Text className="text-white font-bold text-base">Scan to Clock-In</Text>
                  </Pressable>
                </View>

                <View className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
                    <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Worker Name</Text>
                    <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase">Status</Text>
                    <Text className="w-1/4 text-xs font-bold text-gray-500 uppercase text-right">Manual Entry</Text>
                  </View>

                  {siteWorkers.length === 0 ? (
                    <View className="p-10 items-center justify-center">
                      <Ionicons name="people-outline" size={48} color="#E5E7EB" />
                      <Text className="text-gray-400 mt-4 font-medium">No workers assigned to this site yet.</Text>
                    </View>
                  ) : (
                    siteWorkers.map((worker) => {
                      const status = getAttendanceStatus(worker.worker_id);
                      
                      return (
                        <View key={worker.worker_id} className="flex-row items-center py-4 px-6 border-b border-gray-50">
                          <View className="flex-1 flex-row items-center">
                            <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center mr-3">
                              <Ionicons name="person" size={14} color="#3B82F6" />
                            </View>
                            <Text className="font-bold text-gray-800">{worker.profiles?.full_name || 'Unknown Worker'}</Text>
                          </View>

                          <View className="w-1/4">
                            {status === 'Pending' ? (
                              <Text className="text-gray-400 font-semibold italic">Pending</Text>
                            ) : status === 'Present' ? (
                              <Text className="text-green-600 font-bold bg-green-100 px-2 py-1 rounded self-start">Present</Text>
                            ) : (
                              <Text className="text-red-600 font-bold bg-red-100 px-2 py-1 rounded self-start">Absent</Text>
                            )}
                          </View>

                          <View className="w-1/4 flex-row justify-end space-x-2">
                            {status === 'Pending' && (
                              <Pressable 
                                onPress={() => markAttendance(worker.profiles?.qr_code)}
                                className="bg-brand-orange px-4 py-2 rounded-lg"
                              >
                                <Text className="text-white font-bold text-xs">Simulate Scan</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      )}

      {/* Mock QR Scanner Modal */}
      <Modal visible={isScanning} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white w-full rounded-t-3xl overflow-hidden shadow-2xl h-3/4">
            <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-gray-50">
              <View className="flex-row items-center">
                <Ionicons name="qr-code-outline" size={24} color="#F97316" />
                <Text className="text-xl font-bold text-gray-800 ml-3">Simulate Clock-In Scan</Text>
              </View>
              <Pressable onPress={() => setIsScanning(false)} className="p-2 bg-gray-200 rounded-full">
                <Ionicons name="close" size={20} color="#4B5563" />
              </Pressable>
            </View>
            
            <View className="p-8 flex-1">
              <Text className="text-gray-600 mb-6 text-center">
                Scan a worker's QR code to instantly clock them in for today at the selected site.
              </Text>

              {siteWorkers.filter(w => getAttendanceStatus(w.worker_id) === 'Pending').length === 0 ? (
                <Text className="text-gray-400 italic text-center mt-10">All workers at this site have already been logged for today!</Text>
              ) : (
                <ScrollView className="flex-1 border border-gray-200 rounded-xl bg-gray-50 p-2">
                  {siteWorkers.filter(w => getAttendanceStatus(w.worker_id) === 'Pending').map((worker) => (
                    <Pressable 
                      key={worker.worker_id} 
                      onPress={() => markAttendance(worker.profiles?.qr_code)}
                      className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-white rounded-lg mb-2 shadow-sm active:bg-orange-50"
                    >
                      <View className="flex-row items-center">
                        <Ionicons name="id-card-outline" size={24} color="#6B7280" className="mr-3" />
                        <Text className="text-gray-800 font-bold text-base">{worker.profiles?.full_name}</Text>
                      </View>
                      <View className="bg-green-500 px-3 py-1.5 rounded-full">
                        <Text className="text-white text-xs font-bold">Simulate Scan</Text>
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
