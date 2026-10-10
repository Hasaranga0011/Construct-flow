import { ScannerModal } from '@/components/worker/ScannerModal';
import { RecordCard } from '@/components/common/RecordCard';
import { useResponsive } from '@/hooks/useResponsive';
import { api } from '@/services/api';
import { dataError, assignedWorkers, projectSites } from '@/services/siteData';
import { ModalViewport } from '@/components/common/ModalViewport';
import { notify } from '@/utils/notify';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { QRScanner } from '@/components/worker/QRScanner';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';
import { FilterChipGrid } from '@/components/common/FilterChipGrid';

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
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [siteByProject, setSiteByProject] = useState<Record<string, string>>({});

  const [projectWorkers, setProjectWorkers] = useState<WorkerProfile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Scanner & Modal State
  const [isScanning, setIsScanning] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualWorkerId, setManualWorkerId] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  
  const isMounted = useRef(true);
  const requestVersion = useRef(0);

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const fetchAttendanceData = useCallback(async (skipLoadingState = false) => {
    const version = ++requestVersion.current;
    try {
      if (!skipLoadingState) setLoading(true);
      setLoadError('');
      if (!user?.id || sitesLoading || !isMounted.current) return;

      const actualSites = await projectSites(assignedProjectIds);
      const siteMap: Record<string, string> = {};
      actualSites.forEach(s => { if (!siteMap[s.project_id]) siteMap[s.project_id] = s.id; });
      if (isMounted.current && version === requestVersion.current) setSiteByProject(siteMap);

      const { data: projectsData, error: projectsDataError } = assignedProjectIds.length
        ? await supabase.from('projects').select('id, name, location').in('id', assignedProjectIds)
        : { data: [], error: null };
      if (projectsDataError) throw projectsDataError;

      const parsedProjects = projectsData || [];
      if (isMounted.current && version === requestVersion.current) setProjects(parsedProjects);

      if (parsedProjects.length > 0) {
        const currentProject = parsedProjects.some(p => p.id === activeProjectId) ? activeProjectId! : parsedProjects[0].id;
        if (activeProjectId !== currentProject && isMounted.current) setActiveProjectId(currentProject);

        const siteId = siteMap[currentProject];
        if (!siteId) { setProjectWorkers([]); setTodayAttendance([]); throw new Error('This project has no attendance site. Ask an administrator to link a site to the project.'); }

        // attendance.site_id references the physical sites table.
        const todayStr = getTodayDateString();
        const { data: attData, error: attDataError } = await supabase
          .from('attendance')
          .select('id, worker_id, site_id, date, check_in_time, check_out_time, hours_worked')
          .eq('site_id', siteId)
          .eq('date', todayStr);
      if (attDataError) throw attDataError;

        if (isMounted.current && version === requestVersion.current) setTodayAttendance((attData || []) as AttendanceRecord[]);

        const rows = await assignedWorkers([currentProject]);
        if (isMounted.current && version === requestVersion.current) setProjectWorkers(rows.filter(row => row.workerRecordId).map(row => ({
          id: row.workerRecordId!, full_name: row.profiles?.full_name || 'Worker',
          qr_code: row.profiles?.qr_code || null, avatar_url: row.profiles?.avatar_url,
        })));

      }
    } catch (error: any) {
      if (version === requestVersion.current) setLoadError(dataError(error));
    } finally {
      if (isMounted.current && version === requestVersion.current && !skipLoadingState) setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, activeProjectId]);

  useEffect(() => {
    isMounted.current = true;
    fetchAttendanceData();
    return () => { isMounted.current = false; };
  }, [fetchAttendanceData]);

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
        notify('Site unavailable', 'No active site assignment was found for this project.');
      }
      return;
    }
    try {
      const result = await api.labour.scan({ qr_code: qrCode, site_id: activeProjectId });

      // Show scan result card instead of just an alert
      setScanResult(result as ScanResult);
      if (isScanning) setIsScanning(false);
      await fetchAttendanceData(true);
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert(`Scan failed: ${error.message}`);
      } else {
        notify('Scan Error', error.message);
      }
    }
  };

  const handleManualCheckIn = async () => {
    if (manualSubmitting || !manualWorkerId || !activeProjectId) return;
    const attendanceSiteId = siteByProject[activeProjectId];
    if (!attendanceSiteId) { notify('Site unavailable', 'This project needs a linked attendance site.'); return; }

    setManualSubmitting(true);
    try {
      const todayStr = getTodayDateString();
      const existing = todayAttendance.find(a => a.worker_id === manualWorkerId);
      
      const now = new Date();
      const timeStr = now.toISOString();

      if (existing?.check_out_time) {
        notify('Attendance complete', 'This worker has already checked out today.');
        return;
      }
      if (existing?.check_in_time && !existing.check_out_time) {
        // Check out
        const { error } = await supabase
          .from('attendance')
          .update({ check_out_time: timeStr, hours_worked: Math.max(0, Math.round((now.getTime() - new Date(existing.check_in_time!).getTime()) / 36000) / 100) })
          .eq('id', existing.id).eq('site_id', attendanceSiteId).is('check_out_time', null).select('id').single();
        if (error) throw error;
        toast('Checked out successfully');
      } else if (existing) {
        const result = await supabase.from('attendance').update({ check_in_time: timeStr }).eq('id', existing.id).select('id').single();
        if (result.error) throw result.error;
        toast('Checked in successfully');
      } else {
        // Check in
        const { error } = await supabase
          .from('attendance')
          .insert({
            worker_id: manualWorkerId,
            site_id: attendanceSiteId,
            date: todayStr,
            check_in_time: timeStr
          }).select('id').single();
        if (error) throw error;
        toast('Checked in successfully');
      }
      
      setShowManualModal(false);
      setManualWorkerId(null);
      await fetchAttendanceData(true);
    } catch (e: any) {
      notify('Error', e.message);
    } finally {
      setManualSubmitting(false);
    }
  };

  const getAttendanceForWorker = (workerId: string) => {
    return todayAttendance.find(a => a.worker_id === workerId) || null;
  };

  // Helper for web alert
  const toast = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else notify('Success', msg);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Daily Attendance" actionLabel="Refresh" onActionPress={() => { fetchAttendanceData(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <View className="flex-1">
            <>
              {/* Project Selector Tabs */}
              <View className="bg-white px-6 pt-4 border-b border-gray-200">
                <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {projects.map(project => (
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      key={project.id}
                      onPress={() => { setManualWorkerId(null); setTodayAttendance([]); setProjectWorkers([]); setActiveProjectId(project.id); }}
                      className={`mr-6 pb-3 border-b-2 ${activeProjectId === project.id ? 'border-brand-orange' : 'border-transparent'}`}
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeProjectId === project.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                        {project.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4 md:p-8" showsVerticalScrollIndicator={false}>

                {/* Scan Result Card */}
                {scanResult && (
                  <View className={`rounded-xl p-4 mb-6 flex-row items-center border ${scanResult.action === 'check_in' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                    <View className={`w-11 h-11 rounded-full items-center justify-center mr-3 ${scanResult.action === 'check_in' ? 'bg-green-100' : 'bg-blue-100'}`}>
                      <Ionicons
                        name={scanResult.action === 'check_in' ? 'log-in-outline' : 'log-out-outline'}
                        size={22}
                        color={scanResult.action === 'check_in' ? '#22C55E' : '#3B82F6'}
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{scanResult.worker_name}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">
                        {scanResult.action === 'check_in' ? 'Checked In' : `Checked Out · ${scanResult.hours_worked?.toFixed(1) || 0}h worked`}
                      </Text>
                    </View>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setScanResult(null)} className="p-2">
                      <Ionicons name="close" size={18} color="#9CA3AF" />
                    </Pressable>
                  </View>
                )}

                <View className="flex-row flex-wrap gap-4 justify-between items-center mb-6">
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Today&apos;s Attendance</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">{new Date().toDateString()}</Text>
                  </View>

                  <View className="flex-row flex-wrap gap-3">
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => setShowManualModal(true)}
                      className="bg-white border border-gray-200 px-5 py-3 rounded-xl flex-row items-center shadow-sm"
                    >
                      <Ionicons name="create-outline" size={20} color="#4B5563" style={{ marginRight: 8 }} />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-base">Manual Check In/Out</Text>
                    </Pressable>
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => setIsScanning(true)}
                      className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
                    >
                      <Ionicons name="qr-code-outline" size={20} color="white" style={{ marginRight: 8 }} />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Scan QR</Text>
                    </Pressable>
                  </View>
                </View>

                <View className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <View className="hidden lg:flex flex-row py-4 px-6 border-b border-gray-100 bg-gray-50">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-bold text-gray-500 uppercase">Worker</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-bold text-gray-500 uppercase">Status</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-bold text-gray-500 uppercase text-right">Hours</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-bold text-gray-500 uppercase text-right">Action</Text>
                  </View>

                  {projectWorkers.length === 0 ? (
                    <View className="p-10 items-center justify-center">
                      <Ionicons name="people-outline" size={48} color="#E5E7EB" />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 font-medium">No workers assigned to this site yet.</Text>
                    </View>
                  ) : (
                    projectWorkers.map((worker) => {
                      const attRecord = getAttendanceForWorker(worker.id);
                      const status = attRecord?.check_in_time ? 'Present' : 'Pending';
                      const hours = attRecord?.hours_worked;
                      const checkedIn = attRecord?.check_in_time && !attRecord?.check_out_time;

                      if (isMobile) return <RecordCard key={worker.id} title={worker.full_name || 'Unknown Worker'} fields={[{ label: 'Status', value: checkedIn ? 'Present - active' : status }, { label: 'Hours', value: hours == null ? 'Not recorded' : `${Number(hours).toFixed(1)}h` }]} action={{ label: checkedIn ? 'Check out' : 'Mark attendance', disabled: !!attRecord?.check_out_time, onPress: () => { setManualWorkerId(worker.id); setShowManualModal(true); } }} />;
                      return (
                        <View key={worker.id} className="flex-row items-center py-4 px-6 border-b border-gray-50">
                          <View className="flex-1 flex-row items-center">
                            <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center mr-3">
                              <Ionicons name="person" size={14} color="#3B82F6" />
                            </View>
                            <View>
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">{worker.full_name || 'Unknown Worker'}</Text>
                              {checkedIn && (
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-green-600">
                                  In: {new Date(attRecord!.check_in_time!).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              )}
                            </View>
                          </View>

                          <View className="w-[20%]">
                            {status === 'Pending' ? (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-semibold italic text-sm">Pending</Text>
                            ) : status === 'Present' ? (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-600 font-bold bg-green-100 px-2 py-1 rounded self-start text-xs">Present</Text>
                            ) : (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-bold bg-red-100 px-2 py-1 rounded self-start text-xs">Absent</Text>
                            )}
                          </View>

                          <View className="w-[15%] items-end justify-center">
                            {hours != null ? (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm">{hours.toFixed(1)}h</Text>
                            ) : checkedIn ? (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-semibold">Active</Text>
                            ) : (
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-sm">—</Text>
                            )}
                          </View>
                          
                          <View className="w-[20%] items-end justify-center pl-4">
                            {!attRecord?.check_out_time ? (
                              <Pressable 
                                onPress={() => { setManualWorkerId(worker.id); setShowManualModal(true); }}
                                className={`px-3 py-2 rounded-lg border ${checkedIn ? 'bg-amber-50 border-amber-200' : 'bg-brand-light border-gray-200'}`}
                              >
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${checkedIn ? 'text-amber-700' : 'text-gray-600'}`}>
                                  {checkedIn ? 'Check Out' : 'Check In'}
                                </Text>
                              </Pressable>
                            ) : (
                                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs italic">Completed</Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>
            </>
        </View>
      )}

      {/* Manual Check-in Modal */}
      {showManualModal && (
        <Modal transparent animationType="fade" onRequestClose={() => !manualSubmitting && setShowManualModal(false)}>
        <ModalViewport>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white w-full max-w-md rounded-2xl shadow-xl">
            <View className="flex-row flex-wrap gap-4 justify-between items-center mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Manual Attendance</Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowManualModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <View className="mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Select Worker</Text>
              {projectWorkers.length > 0 ? (
                <FilterChipGrid
                  options={projectWorkers.map(w => {
                    const att = getAttendanceForWorker(w.id);
                    const isCheckedIn = att?.check_in_time && !att?.check_out_time;
                    let label = w.full_name || 'Unknown';
                    if (att?.check_out_time) label += ' (Completed)';
                    else if (isCheckedIn) label += ' (Active)';
                    return { id: w.id, label };
                  })}
                  selectedValue={manualWorkerId || ''}
                  onSelect={(id) => {
                    const att = getAttendanceForWorker(id);
                    if (!att?.check_out_time) setManualWorkerId(id);
                  }}
                />
              ) : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm italic">No active workers found.</Text>
              )}
            </View>

            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              onPress={handleManualCheckIn}
              disabled={!manualWorkerId || manualSubmitting}
              className={`w-full py-4 rounded-xl items-center justify-center ${!manualWorkerId ? 'bg-gray-300' : 'bg-brand-orange'}`}
            >
              {manualSubmitting ? <ActivityIndicator color="white" /> : (
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">
                  {manualWorkerId && getAttendanceForWorker(manualWorkerId)?.check_in_time && !getAttendanceForWorker(manualWorkerId)?.check_out_time ? 'Check Out' : 'Check In'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </ModalViewport>
        </Modal>
      )}

      <ScannerModal visible={isScanning} onScan={markAttendance} onClose={() => setIsScanning(false)} />

    </View>
  );
}
