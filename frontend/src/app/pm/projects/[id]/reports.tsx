import { api } from '@/services/api';
import { firstRelation } from '@/utils/relations';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, TextInput, Pressable, Modal, Linking } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { ModalViewport } from '@/components/common/ModalViewport';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';

type MaterialUsed = {
  name: string;
  qty: number;
  unit?: string | null;
};

type SiteReport = {
  id: string;
  project_id: string;
  date: string;
  work_completed: string;
  workers_present_count: number | null;
  materials_used?: MaterialUsed[] | null;
  blockers: string | null;
  photos: string[] | null;
  created_at: string;
  site_manager?: { full_name: string; avatar_url: string | null };
};

const hasRealBlocker = (text?: string | null) => {
  const normalized = (text || '').trim().toLowerCase();
  return Boolean(normalized && !['none', 'no', 'no issues', 'no issue', 'n/a', 'na', 'nil', '-'].includes(normalized));
};

export default function PMProjectSiteReports() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SiteReport[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'blockers' | 'photos'>('all');
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError('');
      const reportsData = await api.siteReports.getByProject(projectId, true);
      setReports((reportsData || []).map((report: SiteReport) => ({ ...report, site_manager: firstRelation(report.site_manager) })));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load site reports.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: refresh when a new report is submitted.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`pm-site-reports:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'site_reports',
        filter: `project_id=eq.${projectId}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadData]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-LK', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  const stats = useMemo(() => {
    const total = reports.length;
    const withBlockers = reports.filter(r => hasRealBlocker(r.blockers)).length;
    const totalPhotos = reports.reduce((sum, r) => sum + (r.photos?.length || 0), 0);
    const workerCounts = reports.map(r => r.workers_present_count).filter((v): v is number => typeof v === 'number');
    const avgWorkers = workerCounts.length
      ? Math.round(workerCounts.reduce((a, b) => a + b, 0) / workerCounts.length)
      : 0;
    return { total, withBlockers, totalPhotos, avgWorkers };
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter(r => {
      if (filterMode === 'blockers' && !hasRealBlocker(r.blockers)) return false;
      if (filterMode === 'photos' && !(r.photos && r.photos.length > 0)) return false;
      if (!q) return true;
      const inWork = r.work_completed?.toLowerCase().includes(q);
      const inBlockers = r.blockers?.toLowerCase().includes(q);
      const inManager = r.site_manager?.full_name?.toLowerCase().includes(q);
      const inMaterials = (r.materials_used || []).some(m => m.name?.toLowerCase().includes(q));
      const inDate = r.date?.includes(q);
      return Boolean(inWork || inBlockers || inManager || inMaterials || inDate);
    });
  }, [reports, searchQuery, filterMode]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Daily Site Reports" actionLabel="Refresh" onActionPress={loadData} showBackButton />

      {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 p-4">{error}</Text>}
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="mb-5">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Site Reports History</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 mt-0.5">
            Daily site progress, workforce attendance, materials consumed & blockers
          </Text>
        </View>

        {!loading && reports.length > 0 && (
          <>
            <View className="flex-row flex-wrap gap-3 mb-5">
              <View className="flex-1 min-w-[130px] bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <Text className="text-xs font-semibold text-gray-400 uppercase">Total Reports</Text>
                <Text className="text-2xl font-bold text-brand-text mt-1">{stats.total}</Text>
              </View>
              <View className="flex-1 min-w-[130px] bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <Text className="text-xs font-semibold text-gray-400 uppercase">Avg Workers / Day</Text>
                <Text className="text-2xl font-bold text-blue-600 mt-1">{stats.avgWorkers}</Text>
              </View>
              <View className="flex-1 min-w-[130px] bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <Text className="text-xs font-semibold text-gray-400 uppercase">Active Blockers</Text>
                <Text className={`text-2xl font-bold mt-1 ${stats.withBlockers > 0 ? 'text-red-500' : 'text-green-600'}`}>{stats.withBlockers}</Text>
              </View>
              <View className="flex-1 min-w-[130px] bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <Text className="text-xs font-semibold text-gray-400 uppercase">Site Photos</Text>
                <Text className="text-2xl font-bold text-brand-orange mt-1">{stats.totalPhotos}</Text>
              </View>
            </View>

            <View className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm mb-5 gap-3">
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3">
                <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                <TextInput
                  maxFontSizeMultiplier={1.3}
                  style={{ minHeight: 42 }}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search work, site manager, materials, blockers, date..."
                  className="flex-1 ml-2 text-sm text-gray-800"
                />
                {!!searchQuery && (
                  <Pressable onPress={() => setSearchQuery('')} className="p-1">
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {[
                  { id: 'all' as const, label: `All (${reports.length})` },
                  { id: 'blockers' as const, label: `Has Blockers (${stats.withBlockers})` },
                  { id: 'photos' as const, label: 'With Photos' },
                ].map(tab => (
                  <Pressable
                    key={tab.id}
                    style={{ minHeight: 36 }}
                    onPress={() => setFilterMode(tab.id)}
                    className={`px-3.5 py-1.5 rounded-full border ${filterMode === tab.id ? 'bg-brand-orange border-brand-orange' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <Text className={`text-xs font-semibold ${filterMode === tab.id ? 'text-white' : 'text-gray-600'}`}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" size="large" />
          </View>
        ) : filteredReports.length === 0 ? (
          <View className="bg-white border border-gray-100 rounded-2xl p-10 items-center justify-center">
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-bold mt-4 text-center">
              {reports.length === 0 ? 'No reports yet' : 'No matching reports'}
            </Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-2 text-center">
              {reports.length === 0 ? "Your site manager hasn't submitted any daily reports." : 'Try clearing your search or filter.'}
            </Text>
          </View>
        ) : (
          filteredReports.map((report: SiteReport) => {
            const blockerFlag = hasRealBlocker(report.blockers);
            return (
              <View key={report.id} className="bg-white border border-gray-100 rounded-2xl p-6 mb-5 shadow-sm">
                <View className="flex-row flex-wrap gap-3 justify-between items-start border-b border-gray-100 pb-4 mb-4">
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold text-lg">{formatDate(report.date)}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1 text-xs">
                      {report.site_manager ? `Submitted by: ${report.site_manager.full_name}` : 'Site Manager'}
                      {report.created_at ? ` • ${new Date(report.created_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    {report.workers_present_count !== null && (
                      <View className="bg-orange-50 px-3 py-1.5 rounded-lg flex-row items-center">
                        <Ionicons name="people" size={14} color="#F97316" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs ml-1.5">{report.workers_present_count} Workers</Text>
                      </View>
                    )}
                    <View className={`px-3 py-1.5 rounded-lg ${blockerFlag ? 'bg-red-50' : 'bg-green-50'}`}>
                      <Text className={`text-xs font-bold ${blockerFlag ? 'text-red-600' : 'text-green-700'}`}>
                        {blockerFlag ? 'Blocker Reported' : 'On Track'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="mb-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">Work Completed</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 leading-relaxed">{report.work_completed}</Text>
                </View>

                {!!report.materials_used?.length && (
                  <View className="mb-4">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">Materials Used</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {report.materials_used.map((m, idx) => (
                        <View key={`${m.name}-${idx}`} className="bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-lg">
                          <Text className="text-xs font-semibold text-brand-orange">
                            {m.name}: {m.qty} {m.unit || 'units'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {blockerFlag ? (
                  <View className="bg-red-50 p-4 rounded-xl border border-red-100 mb-4 flex-row">
                    <Ionicons name="warning" size={16} color="#DC2626" style={{ marginTop: 2, marginRight: 8 }} />
                    <View className="flex-1">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-800 font-bold text-xs uppercase mb-1">Blockers / Issues</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm leading-relaxed">{report.blockers}</Text>
                    </View>
                  </View>
                ) : null}

                {report.photos && report.photos.length > 0 && (
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">
                      Attachments ({report.photos.length})
                    </Text>
                    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                      {report.photos.map((photo, index) => (
                        <Pressable
                          key={index}
                          onPress={() => setPreviewPhotoUrl(photo)}
                          className="w-28 h-24 mr-3 bg-gray-100 rounded-xl overflow-hidden border border-gray-200"
                        >
                          <Image source={{ uri: photo }} className="w-full h-full" resizeMode="cover" />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={Boolean(previewPhotoUrl)} transparent animationType="fade" onRequestClose={() => setPreviewPhotoUrl(null)}>
        <ModalViewport>
          <View className="bg-gray-950 rounded-2xl overflow-hidden w-full max-w-2xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-bold text-base">Site Report Photo</Text>
              <View className="flex-row items-center gap-2">
                {previewPhotoUrl && (
                  <Pressable onPress={() => Linking.openURL(previewPhotoUrl)} className="bg-white/10 px-3 py-1.5 rounded-lg">
                    <Text className="text-white text-xs font-semibold">Open Original</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setPreviewPhotoUrl(null)} style={{ minHeight: 40, minWidth: 40 }} className="items-center justify-center">
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
              </View>
            </View>
            {previewPhotoUrl && (
              <Image source={{ uri: previewPhotoUrl }} resizeMode="contain" style={{ width: '100%', height: 380, borderRadius: 10 }} />
            )}
          </View>
        </ModalViewport>
      </Modal>
    </View>
  );
}
