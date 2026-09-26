import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Platform } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { QRScanner } from '../../../components/worker/QRScanner';

type AttendanceRecord = {
  id: string;
  worker_id: string;
  site_id: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number | null;
  workers?: { user_id: string; profiles?: { full_name: string | null; avatar_url?: string | null } };
};

type WorkerProfile = { id: string; full_name: string | null; qr_code: string | null; avatar_url?: string | null };
type ScanResult = {
  action: 'check_in' | 'check_out';
  worker_name: string;
  time: string;
  hours_worked?: number;
};

export default function SMAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [siteByProject, setSiteByProject] = useState<Record<string, string>>({});

  const [projectWorkers, setProjectWorkers] = useState<WorkerProfile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const isMounted = useRef(true);

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const fetchAttendanceData = async (skipLoadingState = false) => {
    try {
      if (!skipLoadingState) setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session || !isMounted.current) return;
      const userId = sessionData.session.user.id;

      // 1. Fetch projects through site-manager assignment relation (id = site assignment row id)
      const { data: assignments } = await supabase
        .from('site_manager_sites')
        .select('id, project_id')
        .eq('site_manager_id', userId);

      const projectIds = assignments?.map((a) => a.project_id) || [];
      const siteMap = Object.fromEntries(
        (assignments || []).map((a) => [a.project_id, a.id]),
      );
      if (isMounted.current) setSiteByProject(siteMap);

      const { data: projectsData } = projectIds.length
        ? await supabase.from('projects').select('id, name, location').in('id', projectIds).eq('status', 'active')
        : { data: [] };

      const parsedProjects = projectsData || [];
      if (isMounted.current) setProjects(parsedProjects);

      if (parsedProjects.length > 0) {
        const currentProject = activeProjectId || parsedProjects[0].id;
        if (!activeProjectId && isMounted.current) setActiveProjectId(currentProject);

        const siteId = siteMap[currentProject];
        if (!siteId) return;

        // 2. Fetch today's attendance from canonical attendance table (not legacy labour)
        const todayStr = getTodayDateString();
        const { data: attData } = await supabase
          .from('attendance')
          .select('id, worker_id, site_id, date, status, check_in_time, check_out_time, hours_worked')
          .eq('site_id', siteId)
          .eq('date', todayStr);

        if (isMounted.current) setTodayAttendance((attData || []) as AttendanceRecord[]);

        // 3. Fetch workers assigned to this project's site via site_workers
        const { data: siteWorkers } = await supabase
          .from('site_workers')
          .select('worker_id, workers!inner(id, user_id, profiles!inner(id, full_name, qr_code, avatar_url))')
          .eq('project_id', currentProject);

        if (isMounted.current) {
          const workerProfiles: WorkerProfile[] = (siteWorkers || []).map((sw: any) => {
            const profile = Array.isArray(sw.workers?.profiles) ? sw.workers.profiles[0] : sw.workers?.profiles;
            return {
              id: sw.workers?.id || sw.worker_id,
              full_name: profile?.full_name || null,
              qr_code: profile?.qr_code || null,
              avatar_url: profile?.avatar_url || null,
            };
          });
          setProjectWorkers(workerProfiles);
        }
      }
    } catch (error: any) {
      console.error('Error fetching attendance data', error);
    } finally {
      if (isMounted.current && !skipLoadingState) setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchAttendanceData();
    return () => { isMounted.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // Realtime subscription: refresh attendance list when any attendance row changes.
  useEffect(() => {
    const siteId = activeProjectId ? siteByProject[activeProjectId] : null;
    if (!siteId) return;

    const channel = supabase
      .channel(`sm-attendance:${siteId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `site_id=eq.${siteId}`,
      }, () => { fetchAttendanceData(true); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, siteByProject]);

  const markAttendance = async (qrCode: string) => {
    if (!activeProjectId) return;
    const siteId = siteByProject[activeProjectId];
    if (!siteId) {
      if (Platform.OS === 'web') {
        window.alert('No active site assignment was found for this project.');
      } else {
        Alert.alert('Site unavailable', 'No active site assignment was found for this project.');
      }
      return;
    }
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/labour/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ qr_code: qrCode, site_id: siteId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Scan failed');
      }

      // Show scan result card instead of just an alert
      setScanResult(result as ScanResult);
      if (isScanning) setIsScanning(false);
      // Attendance list will update via Realtime subscription above
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert(`Scan failed: ${error.message}`);
      } else {
        Alert.alert('Scan Error', error.message);
      }
    }
  };

  const getAttendanceForWorker = (workerId: string) => {
    return todayAttendance.find(a => a.worker_id === workerId) || null;
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
          {projects.length === 0 ? (
            <View className="flex-1 items-center justify-center p-8">
              <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
              <Text className="text-gray-400 text-lg font-medium text-center mt-4">You have no assigned projects.</Text>
            </View>
          ) : (
            <>
              {/* Project Selector Tabs */}
              <View className="bg-white px-6 pt-4 border-b border-gray-200">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {projects.map(project => (
                    <Pressable
                      key={project.id}
                      onPress={() => setActiveProjectId(project.id)}
                      className={`mr-6 pb-3 border-b-2 ${activeProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
                    >
                      <Text className={`font-bold text-base ${activeProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                        {project.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>

                {/* Scan Result Card */}
                {scanResult && (
                  <View className={`rounded-xl p-4 mb-6 flex-row items-center border ${scanResult.action === 'check_in' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                    <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${scanResult.action === 'check_in' ? 'bg-green-100' : 'bg-blue-100'}`}>
                      <Ionicons
                        name={scanResult.action === 'check_in' ? 'log-in-outline' : 'log-out-outline'}
                        size={22}
                        color={scanResult.action === 'check_in' ? '#22C55E' : '#3B82F6'}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-brand-text">{scanResult.worker_name}</Text>
                      <Text className="text-gray-500 text-sm">
                        {scanResult.action === 'check_in' ? 'Checked In' : `Checked Out · ${scanResult.hours_worked?.toFixed(1) || 0}h worked`}
                      </Text>
                    </View>
                    <Pressable onPress={() => setScanResult(null)} className="p-2">
                      <Ionicons name="close" size={18} color="#9CA3AF" />
                    </Pressable>
                  </View>
                )}

                <View className="flex-row justify-between items-center mb-6">
                  <View>
                    <Text className="text-2xl font-bold text-gray-800">Today&apos;s Attendance</Text>
                    <Text className="text-gray-500">{new Date().toDateString()}</Text>
                  </View>

                  <Pressable
                    onPress={() => setIsScanning(true)}
                    className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
                  >
                    <Ionicons name="qr-code-outline" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text className="text-white font-bold text-base">Scan QR</Text>
                  </Pressable>
                </View>

                <View className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <View className="flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
                    <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Worker</Text>
                    <Text className="w-[22%] text-xs font-bold text-gray-500 uppercase">Status</Text>
                    <Text className="w-[22%] text-xs font-bold text-gray-500 uppercase text-right">Hours</Text>
                  </View>

                  {projectWorkers.length === 0 ? (
                    <View className="p-10 items-center justify-center">
                      <Ionicons name="people-outline" size={48} color="#E5E7EB" />
                      <Text className="text-gray-400 mt-4 font-medium">No workers assigned to this site yet.</Text>
                    </View>
                  ) : (
                    projectWorkers.map((worker) => {
                      const attRecord = getAttendanceForWorker(worker.id);
                      const status = attRecord?.status || 'Pending';
                      const hours = attRecord?.hours_worked;
                      const checkedIn = attRecord?.check_in_time && !attRecord?.check_out_time;

                      return (
                        <View key={worker.id} className="flex-row items-center py-4 px-6 border-b border-gray-50">
                          <View className="flex-1 flex-row items-center">
                            <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center mr-3">
                              <Ionicons name="person" size={14} color="#3B82F6" />
                            </View>
                            <View>
                              <Text className="font-bold text-gray-800">{worker.full_name || 'Unknown Worker'}</Text>
                              {checkedIn && (
                                <Text className="text-xs text-green-600">
                                  In: {new Date(attRecord!.check_in_time!).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              )}
                            </View>
                          </View>

                          <View className="w-[22%]">
                            {status === 'Pending' ? (
                              <Text className="text-gray-400 font-semibold italic text-sm">Pending</Text>
                            ) : status === 'Present' ? (
                              <Text className="text-green-600 font-bold bg-green-100 px-2 py-1 rounded self-start text-xs">Present</Text>
                            ) : (
                              <Text className="text-red-600 font-bold bg-red-100 px-2 py-1 rounded self-start text-xs">Absent</Text>
                            )}
                          </View>

                          <View className="w-[22%] items-end">
                            {hours != null ? (
                              <Text className="text-brand-text font-bold text-sm">{hours.toFixed(1)}h</Text>
                            ) : checkedIn ? (
                              <Text className="text-brand-orange text-xs font-semibold">Active</Text>
                            ) : (
                              <Text className="text-gray-300 text-sm">—</Text>
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

      {isScanning && <QRScanner onScan={markAttendance} onClose={() => setIsScanning(false)} />}

    </View>
  );
}
