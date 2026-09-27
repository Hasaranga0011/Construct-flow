import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
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
  const { assignedProjectIds, loading: sitesLoading } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [reports, setReports] = useState<SiteReport[]>([]);

  const loadData = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);

      if (!assignedProjectIds.length) {
        setLoading(false);
        return;
      }

      const { data: projectsData } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', assignedProjectIds)
        .eq('status', 'active');

      const parsedProjects = projectsData || [];
      setProjects(parsedProjects);

      const activeId = activeProjectId || parsedProjects[0]?.id || null;
      if (!activeProjectId && activeId) setActiveProjectId(activeId);

      if (activeId) {
        const { data: reportsData } = await supabase
          .from('site_reports')
          .select('id, project_id, date, work_completed, workers_present_count, blockers, photos, created_at')
          .eq('project_id', activeId)
          .eq('site_manager_id', user.id)
          .order('date', { ascending: false });
        setReports((reportsData || []) as SiteReport[]);
      }
    } catch (error) {
      console.error('Failed to load site reports:', error);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, user?.id, sitesLoading, assignedProjectIds]);

  useEffect(() => { loadData(); }, [loadData]);

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {projects.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => setActiveProjectId(p.id)}
                  className={`mr-6 pb-3 border-b-2 ${activeProjectId === p.id ? 'border-brand-orange' : 'border-transparent'}`}
                >
                  <Text className={`font-bold text-base ${activeProjectId === p.id ? 'text-brand-orange' : 'text-gray-500'}`}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">Daily Reports</Text>
              <Pressable
                onPress={() => router.push('/site-manager/reports/create')}
                className="bg-brand-orange px-5 py-3 rounded-xl flex-row items-center shadow-sm"
              >
                <Ionicons name="add" size={18} color="white" style={{ marginRight: 6 }} />
                <Text className="text-white font-bold">New Report</Text>
              </Pressable>
            </View>

            {reports.length === 0 ? (
              <View className="bg-white rounded-xl p-10 items-center border border-gray-100 shadow-sm">
                <Ionicons name="document-text-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4 font-medium">No reports yet for this project.</Text>
                <Pressable
                  onPress={() => router.push('/site-manager/reports/create')}
                  className="mt-6 bg-brand-orange px-6 py-3 rounded-lg"
                >
                  <Text className="text-white font-bold">Submit First Report</Text>
                </Pressable>
              </View>
            ) : (
              reports.map(report => (
                <View key={report.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View>
                      <Text className="font-bold text-brand-text text-base">{formatDate(report.date)}</Text>
                      <Text className="text-gray-500 text-xs mt-0.5">
                        {report.workers_present_count != null ? `${report.workers_present_count} workers present` : 'Workers not recorded'}
                      </Text>
                    </View>
                    {report.photos && report.photos.length > 0 && (
                      <View className="flex-row items-center bg-blue-50 px-2 py-1 rounded-full">
                        <Ionicons name="image-outline" size={12} color="#3B82F6" />
                        <Text className="text-blue-600 text-xs font-semibold ml-1">{report.photos.length} photo{report.photos.length !== 1 ? 's' : ''}</Text>
                      </View>
                    )}
                  </View>

                  <Text className="text-gray-700 text-sm leading-5 mb-3">{report.work_completed}</Text>

                  {report.blockers && (
                    <View className="bg-red-50 rounded-lg p-3 flex-row items-start">
                      <Ionicons name="warning-outline" size={14} color="#EF4444" style={{ marginRight: 6, marginTop: 1 }} />
                      <Text className="text-red-700 text-sm flex-1">{report.blockers}</Text>
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
