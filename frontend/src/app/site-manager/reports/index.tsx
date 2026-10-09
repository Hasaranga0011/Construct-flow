import { dataError } from '@/services/siteData';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Pressable, Image, Linking,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { NoAssignedSites } from '@/components/common/NoAssignedSites';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAuth } from '@/context/AuthContext';

type SiteReport = {
  id: string;
  project_id: string;
  date: string;
  work_completed: string;
  workers_present_count: number | null;
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

      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      const activeId = parsedProjects.some(p => p.id === activeProjectId) ? activeProjectId : parsedProjects[0]?.id || null;
      if (activeProjectId !== activeId) setActiveProjectId(activeId);

      if (activeId) {
        const { data: reportsData, error: reportsDataError } = await supabase
          .from('site_reports')
          .select('id, project_id, date, work_completed, workers_present_count, blockers, photos, created_at')
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
            <View className="flex-row flex-wrap gap-3 justify-between items-center mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800">Daily Reports</Text>
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => router.push('/site-manager/reports/create')}
                className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
              >
                <Ionicons name="add" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">New Report</Text>
              </Pressable>
            </View>

            {reports.length === 0 ? (
              <View className="bg-white rounded-xl p-10 items-center border border-gray-100 shadow-sm">
                <Ionicons name="document-text-outline" size={48} color="#E5E7EB" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-4 font-medium">No reports yet for this project.</Text>
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => router.push('/site-manager/reports/create')}
                  className="mt-6 bg-brand-orange px-6 py-3 rounded-lg"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Submit First Report</Text>
                </Pressable>
              </View>
            ) : (
              reports.map(report => (
                <View key={report.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text text-base">{formatDate(report.date)}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">
                        {report.workers_present_count != null ? `${report.workers_present_count} workers present` : 'Workers not recorded'}
                      </Text>
                    </View>
                    {report.photos && report.photos.length > 0 && (
                      <View className="flex-row items-center bg-blue-50 px-2 py-1 rounded-full">
                        <Ionicons name="image-outline" size={12} color="#3B82F6" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-600 text-xs font-semibold ml-1">{report.photos.length} photo{report.photos.length !== 1 ? 's' : ''}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-sm leading-5 mb-3">{report.work_completed}</Text>

                  {!!report.photos?.length && <ScrollView keyboardShouldPersistTaps="handled" horizontal className="mb-3" contentContainerStyle={{ gap: 12 }}>{report.photos.map((url, index) => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={`${url}-${index}`} accessibilityLabel={`Open report photo ${index + 1}`} onPress={() => Linking.openURL(url)}><Image source={{ uri: url }} style={{ width: 140, height: 100, borderRadius: 8 }} /></Pressable>)}</ScrollView>}
                  {report.blockers && (
                    <View className="bg-red-50 rounded-lg p-3 flex-row items-start">
                      <Ionicons name="warning-outline" size={14} color="#EF4444" style={{ marginRight: 6, marginTop: 1 }} />
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm flex-1">{report.blockers}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
