import { dataError } from '@/services/siteData';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Pressable, Image, Linking, TextInput, Modal,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { ModalViewport } from '@/components/common/ModalViewport';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

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
  materials_used: MaterialUsed[] | null;
  blockers: string | null;
  photos: string[] | null;
  created_at: string;
};

type Project = { id: string; name: string };

export default function SiteManagerReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [reports, setReports] = useState<SiteReport[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'blockers' | 'photos'>('all');
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);
      setLoadError('');

      if (!assignedProjectIds.length) {
        setLoading(false);
        return;
      }

      const { data: projectsData, error: projectsDataError } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', assignedProjectIds)
        ;
      if (projectsDataError) throw projectsDataError;

      const parsedProjects = (projectsData || []).filter((p): p is Project => Boolean(p.id && p.name));
      setProjects(parsedProjects);

      const activeId = parsedProjects.some(p => p.id === activeProjectId) ? activeProjectId : parsedProjects[0]?.id || null;
      if (activeProjectId !== activeId) setActiveProjectId(activeId);

      if (activeId) {
        const { data: reportsData, error: reportsDataError } = await supabase
          .from('site_reports')
          .select('id, project_id, date, work_completed, workers_present_count, materials_used, blockers, photos, created_at')
          .eq('project_id', activeId)
          .eq('site_manager_id', user.id)
          .order('date', { ascending: false });
      if (reportsDataError) throw reportsDataError;
        setReports((reportsData || []) as SiteReport[]);
      }
    } catch (error) {
      setLoadError(dataError(error));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, user?.id, sitesLoading, assignedProjectIds]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Realtime: refresh when a new report is submitted.
  useEffect(() => {
    if (!activeProjectId) return;
    const channel = supabase
      .channel(`site-reports:${activeProjectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'site_reports',
        filter: `project_id=eq.${activeProjectId}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeProjectId, loadData]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-LK', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  const stats = useMemo(() => {
    const total = reports.length;
    const withBlockers = reports.filter(r => Boolean(r.blockers?.trim())).length;
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
      if (filterMode === 'blockers' && !r.blockers?.trim()) return false;
      if (filterMode === 'photos' && !(r.photos && r.photos.length > 0)) return false;
      if (!q) return true;
      const inWork = r.work_completed?.toLowerCase().includes(q);
      const inBlockers = r.blockers?.toLowerCase().includes(q);
      const inMaterials = (r.materials_used || []).some(m => m.name?.toLowerCase().includes(q));
      const inDate = r.date?.includes(q);
      return Boolean(inWork || inBlockers || inMaterials || inDate);
    });
  }, [reports, searchQuery, filterMode]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav
        title="Site Reports"
        actionLabel="+ New Report"
        onActionPress={() => router.push('/site-manager/reports/create')}
      />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <View className="flex-1">
          {/* Project tab strip */}
          <View className="bg-white px-6 pt-4 border-b border-gray-200">
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {projects.map(p => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={p.id}
                  onPress={() => setActiveProjectId(p.id)}
                  className={`mr-6 pb-3 border-b-2 ${activeProjectId === p.id ? 'border-brand-orange' : 'border-transparent'}`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-base ${activeProjectId === p.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-3 justify-between items-center mb-5">
              <View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Daily Reports</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 mt-0.5">
                  Daily progress logs, workforce headcount, materials & blockers
                </Text>
              </View>
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => router.push('/site-manager/reports/create')}
                className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
              >
                <Ionicons name="add" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">New Report</Text>
              </Pressable>
            </View>

            {/* Summary KPI Strip */}
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
                <Text className="text-xs font-semibold text-gray-400 uppercase">With Blockers</Text>
                <Text className={`text-2xl font-bold mt-1 ${stats.withBlockers > 0 ? 'text-red-500' : 'text-green-600'}`}>{stats.withBlockers}</Text>
              </View>
              <View className="flex-1 min-w-[130px] bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <Text className="text-xs font-semibold text-gray-400 uppercase">Site Photos</Text>
                <Text className="text-2xl font-bold text-brand-orange mt-1">{stats.totalPhotos}</Text>
              </View>
            </View>

            {/* Search & Filters */}
            {reports.length > 0 && (
              <View className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm mb-5 gap-3">
                <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3">
                  <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                  <TextInput
                    maxFontSizeMultiplier={1.3}
                    style={{ minHeight: 42 }}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search work completed, materials, blockers, date..."
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
            )}

            {filteredReports.length === 0 ? (
              <View className="bg-white rounded-xl p-10 items-center border border-gray-100 shadow-sm">
                <Ionicons name="document-text-outline" size={48} color="#E5E7EB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 font-medium">
                  {reports.length === 0 ? 'No reports yet for this project.' : 'No reports match your search/filter.'}
                </Text>
                {reports.length === 0 && (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    onPress={() => router.push('/site-manager/reports/create')}
                    className="mt-6 bg-brand-orange px-6 py-3 rounded-lg"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Submit First Report</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              filteredReports.map(report => (
                <View key={report.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
                  <View className="flex-row flex-wrap justify-between items-start gap-2 mb-3 pb-3 border-b border-gray-100">
                    <View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text text-base">{formatDate(report.date)}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-0.5">
                        Logged {report.created_at ? new Date(report.created_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' }) : report.date}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <View className="flex-row items-center bg-gray-100 px-2.5 py-1 rounded-full">
                        <Ionicons name="people-outline" size={12} color="#4B5563" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-xs font-semibold ml-1">
                          {report.workers_present_count != null ? `${report.workers_present_count} workers` : 'N/A'}
                        </Text>
                      </View>
                      {report.photos && report.photos.length > 0 && (
                        <View className="flex-row items-center bg-blue-50 px-2.5 py-1 rounded-full">
                          <Ionicons name="image-outline" size={12} color="#3B82F6" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-600 text-xs font-semibold ml-1">{report.photos.length} photo{report.photos.length !== 1 ? 's' : ''}</Text>
                        </View>
                      )}
                      <View className={`px-2.5 py-1 rounded-full ${report.blockers?.trim() ? 'bg-red-50' : 'bg-green-50'}`}>
                        <Text className={`text-xs font-semibold ${report.blockers?.trim() ? 'text-red-600' : 'text-green-700'}`}>
                          {report.blockers?.trim() ? 'Blocker' : 'On Track'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text className="text-xs font-bold text-gray-400 uppercase mb-1">Work Completed</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-sm leading-5 mb-3">{report.work_completed}</Text>

                  {!!report.materials_used?.length && (
                    <View className="mb-3">
                      <Text className="text-xs font-bold text-gray-400 uppercase mb-1.5">Materials Used</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {report.materials_used.map((m, idx) => (
                          <View key={`${m.name}-${idx}`} className="bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg">
                            <Text className="text-xs font-semibold text-brand-orange">
                              {m.name}: {m.qty} {m.unit || 'units'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {!!report.photos?.length && (
                    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 12 }}>
                      {report.photos.map((url, index) => (
                        <Pressable
                          style={{ minHeight: 44, minWidth: 44 }}
                          key={`${url}-${index}`}
                          accessibilityLabel={`Open report photo ${index + 1}`}
                          onPress={() => setPreviewPhotoUrl(url)}
                        >
                          <Image source={{ uri: url }} style={{ width: 140, height: 100, borderRadius: 10 }} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}

                  {report.blockers && (
                    <View className="bg-red-50 border border-red-100 rounded-xl p-3 flex-row items-start">
                      <Ionicons name="warning-outline" size={16} color="#EF4444" style={{ marginRight: 8, marginTop: 1 }} />
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-red-700 uppercase mb-0.5">Blockers / Issues</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm">{report.blockers}</Text>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      <Modal visible={Boolean(previewPhotoUrl)} transparent animationType="fade" onRequestClose={() => setPreviewPhotoUrl(null)}>
        <ModalViewport>
          <View className="bg-gray-950 rounded-2xl overflow-hidden w-full max-w-2xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-bold text-base">Site Report Photo</Text>
              <View className="flex-row items-center gap-2">
                {previewPhotoUrl && (
                  <Pressable
                    onPress={() => Linking.openURL(previewPhotoUrl)}
                    className="bg-white/10 px-3 py-1.5 rounded-lg"
                  >
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
