import { DateField } from '../common/DateField';
import { getApiUrl } from '../../lib/apiUrl';
import { ModalViewport } from '../common/ModalViewport';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';

import Ionicons from '@expo/vector-icons/Ionicons';
import { toast } from '../../lib/toast';
import { FilterChipGrid } from '@/components/common/FilterChipGrid';

type CheckInWorkerModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export const CheckInWorkerModal = ({ visible, onClose, onSuccess }: CheckInWorkerModalProps) => {
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<'Present' | 'On Leave' | 'Absent'>('Present');
  const [checkInTime, setCheckInTime] = useState('');
  const [hoursWorked, setHoursWorked] = useState('0');
  const [overtime, setOvertime] = useState('0');

  const [workers, setWorkers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[] | null>(null);
  const availableWorkers = projectId && assignedWorkerIds ? workers.filter(worker => assignedWorkerIds.includes(worker.id)) : [];

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch active projects and workers
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchData = async () => {
      setFetchingData(true);
      try {
        const [projectsReq, workersReq] = await Promise.all([
          supabase.from('projects').select('id, name').in('status', ['Active', 'active', 'In Progress', 'in_progress']),
          supabase.from('profiles').select('id, full_name').eq('role', 'worker').eq('is_approved', true)
        ]);

        if (projectsReq.error) throw projectsReq.error;
        if (workersReq.error) throw workersReq.error;

        if (isMounted) {
          setProjects(projectsReq.data || []);
          setWorkers(workersReq.data || []);

          // Auto-set time to now in HH:mm format
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mm = String(now.getMinutes()).padStart(2, '0');
          setCheckInTime(`${hh}:${mm}`);
        }
      } catch (err) {
        console.warn('Could not load lookup data for check-in modal', err);
      } finally {
        if (isMounted) setFetchingData(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [visible]);

  useEffect(() => {
    let active = true;
    setWorkerId(null);
    setAssignedWorkerIds(null);
    if (!visible || !projectId) return;
    void (async () => {
      try {
        const assignments = await supabase.from('site_workers').select('worker_id').eq('project_id', projectId);
        if (assignments.error) throw assignments.error;
        const identifiers = (assignments.data || []).map(row => row.worker_id).filter(Boolean);
        const records = identifiers.length ? await supabase.from('workers').select('id,user_id').in('id', identifiers) : { data: [], error: null };
        if (records.error) throw records.error;
        if (active) setAssignedWorkerIds([...new Set([...identifiers, ...(records.data || []).map(row => row.user_id).filter(Boolean)])] as string[]);
      } catch (error) {
        if (active) { setAssignedWorkerIds([]); setErrorMsg(error instanceof Error ? error.message : 'Could not load assigned workers.'); }
      }
    })();
    return () => { active = false; };
  }, [visible, projectId]);

  const handleCreate = async () => {
    if (!workerId || !projectId || !status) {
      setErrorMsg('Please select a worker, project, and status.');
      return;
    }
    if (status === 'Present' && !checkInTime) {
      setErrorMsg('Check in time is required when Present.');
      return;
    }
    const regular = Number(hoursWorked), extra = Number(overtime);
    if (status === 'Present' && (!hoursWorked.trim() || !overtime.trim() || !Number.isFinite(regular) || !Number.isFinite(extra) || regular < 0 || regular > 8 || extra < 0 || regular + extra > 24 || (extra > 0 && regular !== 8))) {
      setErrorMsg('Enter 0–8 regular hours and valid overtime after eight regular hours, up to 24 hours total.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const selectedWorker = workers.find(w => w.id === workerId);
      const workerName = selectedWorker ? selectedWorker.full_name : 'Unknown Worker';


      // Format checkInTime to a full timestamp if they are present
      let checkInTimestamp = null;
      if (status === 'Present' && checkInTime) {
        const [hh, mm] = checkInTime.split(':');
        const dt = new Date();
        dt.setHours(Number(hh), Number(mm), 0, 0);
        checkInTimestamp = dt.toISOString();
      }

      const totalHours = status === 'Present' ? Number(hoursWorked) + Number(overtime) : 0;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`${getApiUrl()}/labour`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          project_id: projectId,
          worker_id: workerId,
          worker_name: workerName,
          check_in_time: checkInTimestamp,
          role: 'Labourer',
          hours_worked: totalHours,
          status: status
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to record attendance');
      }

      // Reset form
      setWorkerId(null);
      setProjectId(null);
      setStatus('Present');
      setHoursWorked('0');
      setOvertime('0');

      toast.success('Attendance recorded!');
      onSuccess();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to record attendance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalViewport>
        <View className="bg-white max-h-full w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">

          {/* Header */}
          <View className="flex-row justify-between items-center p-6 border-b border-gray-100 bg-brand-light">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">Check In Worker</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} style={{ flexShrink: 1 }}>
            {errorMsg ? (
              <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-sm text-center">{errorMsg}</Text>
              </View>
            ) : null}

            {fetchingData ? (
              <View className="py-10 items-center justify-center">
                <ActivityIndicator color="#F97316" />
              </View>
            ) : (
              <>
                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Select Worker</Text>
                  {availableWorkers.length > 0 ? (
                    <FilterChipGrid
                      options={availableWorkers.map(w => ({ id: w.id, label: w.full_name }))}
                      selectedValue={workerId || ''}
                      onSelect={setWorkerId}
                    />
                  ) : (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm italic">{!projectId ? 'Choose a project below to load its assigned workers.' : assignedWorkerIds === null ? 'Loading assigned workers...' : 'No approved workers are assigned to this project.'}</Text>
                  )}
                </View>

                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Assign to Project</Text>
                  {projects.length > 0 ? (
                    <FilterChipGrid
                      options={projects.map(p => ({ id: p.id, label: p.name }))}
                      selectedValue={projectId || ''}
                      onSelect={setProjectId}
                    />
                  ) : (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm italic">No active projects found.</Text>
                  )}
                </View>

                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Status</Text>
                  <View className="flex-row gap-2">
                    {['Present', 'On Leave', 'Absent'].map(s => (
                      <Pressable style={{ minHeight: 44, minWidth: 44 }}
                        key={s}
                        onPress={() => setStatus(s as any)}
                        className={`flex-1 py-3 rounded-xl border items-center justify-center ${status === s ? 'bg-brand-dark border-brand-dark' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${status === s ? 'text-white' : 'text-gray-600'}`}>
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {status === 'Present' && (
                  <>
                    <Text className="text-sm text-gray-500 mb-3">Use 0 hours for an open check-in. Enter completed hours only; overtime applies after eight regular hours.</Text>
                    <View className="mb-4">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Check In Time</Text>
                      <DateField label="Check in time" mode="time" value={checkInTime} onChange={setCheckInTime} />
                    </View>

                    <View className="flex-row gap-4 mb-4">
                      <View className="flex-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Hours Worked</Text>
                        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                          className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                          placeholder="8"
                          keyboardType="numeric"
                          value={hoursWorked}
                          onChangeText={setHoursWorked}
                        />
                      </View>
                      <View className="flex-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Overtime (hrs)</Text>
                        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                          className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
                          placeholder="0"
                          keyboardType="numeric"
                          value={overtime}
                          onChangeText={setOvertime}
                        />
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            {/* Footer Buttons */}
            <View className="flex-row gap-4 pt-4 border-t border-gray-100 pb-2">
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={onClose}
                disabled={loading}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-bold text-base">Cancel</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={handleCreate}
                disabled={loading || fetchingData}
                className={`flex-1 bg-brand-orange py-4 rounded-xl items-center justify-center shadow-sm hover:bg-orange-600 transition-colors ${loading || fetchingData ? 'opacity-70' : ''}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Check In</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

        </View>
      </ModalViewport>
    </Modal>
  );
};
