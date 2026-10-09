import { ScannerModal } from '@/components/worker/ScannerModal';
import { RecordCard } from '@/components/common/RecordCard';
import { useResponsive } from '@/hooks/useResponsive';
import { dataError, assignedWorkers } from '@/services/siteData';
import { notify, confirmAction } from '@/utils/notify';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Modal } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { QRScanner } from '@/components/worker/QRScanner';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

export default function SMTeamPage() {
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, assignments, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);

  // Assignment Modal
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);
      setLoadError('');

      if (assignedProjectIds.length > 0) {
        const { data: projectsData, error: projectsDataError } = await supabase
          .from('projects')
          .select('id, name, location')
          .in('id', assignedProjectIds);
      if (projectsDataError) throw projectsDataError;

        const parsedSites = projectsData?.map((p: any) => {
          const assignment = assignments.find((a: any) => a.projectId === p.id);
          return { id: p.id, siteId: assignment?.assignmentId, name: p.name, location: p.location };
        }) || [];
        setSites(parsedSites);

        setWorkers(await assignedWorkers(assignedProjectIds));
      }

    } catch (error: any) {
      setLoadError(dataError(error));
      notify('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, sitesLoading, assignedProjectIds, assignments]);

  useEffect(() => { fetchTeamData(); }, [fetchTeamData]);

  const handleScanQR = async (qrCode: string) => {
    if (!selectedSiteId || !user?.id) return;
    try {
      const { data: worker, error: workerError } = await supabase
        .from('profiles')
        .select('id, full_name')
                .eq('qr_code', qrCode)
        .single();
      if (workerError) throw workerError;

      const { data: record, error: recordError } = await supabase.from('workers').select('id').eq('user_id', worker.id).single();
      if (recordError || !record) throw new Error('This profile is not linked to a worker record. Contact your administrator.');
      const { error } = await supabase
        .from('site_workers')
        .insert({
          project_id: selectedSiteId,
          worker_id: record.id
        });

      if (error) {
        if (error.code === '23505') {
          notify('Notice', 'This Worker is already assigned to this site.');
        } else {
          throw error;
        }
      } else {
        notify('Success', `${worker.full_name || 'Worker'} assigned successfully!`);
        setIsAssigning(false);
        setSelectedSiteId(null);
        fetchTeamData();
      }
    } catch (error: any) {
      notify('Error', error.message);
    }
  };

  const handleRemoveWorker = async (assignmentId: string) => {
    if (!await confirmAction('Remove worker?', 'Remove this worker from the project? Existing attendance records are retained.')) return;
    try {
      const { error } = await supabase
        .from('site_workers')
        .delete()
        .eq('id', assignmentId).in('project_id', assignedProjectIds);
      if (error) throw error;
      fetchTeamData();
    } catch (error: any) {
      notify('Error', error.message);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <TopNav title="Worker Management" actionLabel="Refresh" onActionPress={() => { fetchTeamData(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4" showsVerticalScrollIndicator={false}>

          <View className="mb-6 flex-row justify-between items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Assigned Site Workers</Text>
          </View>

          {sites.length === 0 ? (
            <View className="bg-white p-12 rounded-xl border border-gray-200 items-center justify-center shadow-sm">
              <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium text-center">You have no assigned sites.</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-2 text-center">Please contact your Project Manager for site assignments.</Text>
            </View>
          ) : (
          <View className="space-y-6">
              {sites.map(site => {
                const siteWorkers = workers.filter(w => w.project_id === site.id);

                return (
                  <View key={site.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <View className="flex-row flex-wrap gap-3 justify-between items-center mb-4 border-b border-gray-100 pb-4">
                      <View className="min-w-0 max-w-full flex-shrink">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800">{site.name}</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">{site.location || 'Unknown Location'}</Text>
                      </View>

                      <Pressable style={{ minHeight: 44, minWidth: 44 }}
                        onPress={() => {
                          setSelectedSiteId(site.id);
                          setIsAssigning(true);
                        }}
                        className="bg-brand-orange px-4 py-2 rounded-lg flex-row items-center"
                      >
                        <Ionicons name="qr-code-outline" size={16} color="white" className="mr-2" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold ml-2">Scan Worker QR</Text>
                      </Pressable>
                    </View>

                    {siteWorkers.length === 0 ? (
                      <View className="py-8 items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <Ionicons name="construct-outline" size={32} color="#9CA3AF" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2 text-sm">No workers currently assigned to this site.</Text>
                      </View>
                    ) : (
                      <View className="space-y-3 mt-2">
                        <View className="hidden lg:flex flex-row py-2 px-4 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[2] text-xs font-bold text-gray-500 uppercase">Worker Name</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-bold text-gray-500 uppercase">Status</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-20 text-xs font-bold text-gray-500 uppercase text-right">Actions</Text>
                        </View>
                        {siteWorkers.map((worker) => isMobile ? <RecordCard key={worker.id} title={worker.profiles?.full_name || 'Worker'} fields={[{ label: 'Status', value: 'Assigned' }]} action={{ label: 'Remove worker', accessibilityLabel: `Remove ${worker.profiles?.full_name || 'worker'}`, onPress: () => handleRemoveWorker(worker.id) }} /> : (
                          <View key={worker.id} className="flex-row items-center p-4 bg-white border border-gray-100 rounded-lg hover:bg-gray-50">
                            <View className="flex-[2] flex-row items-center">
                              <View className="w-8 h-8 bg-orange-100 rounded-full items-center justify-center mr-3">
                                <Ionicons name="person" size={14} color="#F97316" />
                              </View>
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold flex-1">{worker.profiles?.full_name || 'Unknown Worker'}</Text>
                            </View>

                            <View className="flex-1">
                              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-600 text-xs font-bold bg-green-100 px-2 py-1 rounded self-start">Active</Text>
                            </View>

                            <View className="w-20 items-end">
                              <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel={`Remove ${worker.profiles?.full_name || 'worker'}`} onPress={() => handleRemoveWorker(worker.id)} className="p-3">
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

      <ScannerModal visible={isAssigning} onScan={handleScanQR} onClose={() => setIsAssigning(false)} />

    </View>
  );
}
