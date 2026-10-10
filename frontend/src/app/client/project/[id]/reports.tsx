import { firstRelation } from '@/utils/relations';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Image } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';

type SiteReport = {
  id: string;
  project_id: string;
  date: string;
  work_completed: string;
  workers_present_count: number | null;
  blockers: string | null;
  photos: string[] | null;
  created_at: string;
  site_manager?: { full_name: string; avatar_url: string | null };
};

export default function ClientProjectSiteReports() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SiteReport[]>([]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const { data: reportsData } = await supabase
        .from('site_reports')
        .select(`
          id, project_id, date, work_completed, workers_present_count, blockers, photos, created_at, site_manager_id
        `)
        .eq('project_id', projectId)
        .order('date', { ascending: false });
        
      const parsedReports = reportsData || [];
      const smIds = [...new Set(parsedReports.map(r => r.site_manager_id).filter((id): id is string => Boolean(id)))];
      if (smIds.length > 0) {
        const { data: smProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', smIds);
        
        if (smProfiles) {
          const smMap = smProfiles.reduce((acc: any, p) => {
            if (p.id) acc[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
            return acc;
          }, {});
          parsedReports.forEach(r => {
            if (r.site_manager_id && smMap[r.site_manager_id]) {
              r.site_manager = smMap[r.site_manager_id];
            }
          });
        }
      }
      setReports(parsedReports as SiteReport[]);
    } catch (error) {
      console.error('Failed to load site reports:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: refresh when a new report is submitted.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`client-site-reports:${projectId}`)
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

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Daily Site Reports" showAction={false} />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-gray-800 mb-6">Site Reports History</Text>
        
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" size="large" />
          </View>
        ) : reports.length === 0 ? (
          <View className="bg-white border border-gray-100 rounded-2xl p-10 items-center justify-center">
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-bold mt-4 text-center">No reports yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-2 text-center">Your site manager hasn&apos;t submitted any daily reports.</Text>
          </View>
        ) : (
          reports.map(report => (
            <View key={report.id} className="bg-white border border-gray-100 rounded-2xl p-6 mb-6 shadow-sm">
              <View className="flex-row justify-between items-start border-b border-gray-50 pb-4 mb-4">
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold text-lg">{formatDate(report.date)}</Text>
                  {report.site_manager && (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1 text-xs">Submitted by: {report.site_manager.full_name}</Text>
                  )}
                </View>
                {report.workers_present_count !== null && (
                  <View className="bg-orange-50 px-3 py-1.5 rounded-lg flex-row items-center">
                    <Ionicons name="people" size={14} color="#F97316" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs ml-1.5">{report.workers_present_count} Workers</Text>
                  </View>
                )}
              </View>

              <View className="mb-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">Work Completed</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 leading-relaxed">{report.work_completed}</Text>
              </View>

              {report.blockers ? (
                <View className="bg-red-50 p-4 rounded-xl border border-red-100 mb-4 flex-row">
                  <Ionicons name="warning" size={16} color="#DC2626" className="mt-0.5 mr-2" />
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-800 font-bold text-xs uppercase mb-1">Blockers / Issues</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm leading-relaxed">{report.blockers}</Text>
                  </View>
                </View>
              ) : null}

              {report.photos && report.photos.length > 0 && (
                <View>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">Attachments</Text>
                  <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {report.photos.map((photo, index) => (
                      <View key={index} className="w-24 h-24 mr-3 bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                        <Image source={{ uri: photo }} className="w-full h-full" resizeMode="cover" />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
