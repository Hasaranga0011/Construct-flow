import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { SearchInput } from '@/components/common/SearchInput';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { useTableRealtime } from '../../../hooks/useTableRealtime';

export default function AdminAttendanceIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tick, lastUpdated } = useTableRealtime(['attendance', 'legacy_labour', 'profiles', 'projects']);

  const [globalStats, setGlobalStats] = useState({ totalWorkers: 0, checkedIn: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchSites = async () => {
      try {
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const utcDate = now.toISOString().split('T')[0];
        const todayDates = Array.from(new Set([localDate, utcDate]));

        // Fetch projects
        let query = supabase.from('projects').select('id, name, location, status');
        if (search) query = query.ilike('name', `%${search}%`);

        const [projReq, sitesReq, attReq, legacyReq, totalWorkersReq] = await Promise.all([
          query,
          supabase.from('sites').select('id, project_id'),
          supabase.from('attendance').select('id, site_id, check_in_time, check_out_time').in('date', todayDates).not('check_in_time', 'is', null).is('check_out_time', null),
          supabase.from('legacy_labour').select('id, project_id, status').in('date', todayDates).eq('status', 'Present'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker')
        ]);

        if (projReq.error) throw projReq.error;

        const siteToProj = new Map((sitesReq.data || []).map(s => [s.id, s.project_id]));
        const activeAtt = attReq.data || [];
        const activeLegacy = legacyReq.data || [];

        if (isMounted) {
          const enrichedProjects = (projReq.data || []).map((p: any) => {
            const attCount = activeAtt.filter(a => siteToProj.get(a.site_id) === p.id || a.site_id === p.id).length;
            const legacyCount = activeLegacy.filter(a => a.project_id === p.id).length;
            return {
              ...p,
              checkedInToday: Math.max(attCount, legacyCount)
            };
          });

          const totalCheckedIn = activeAtt.length > 0 ? activeAtt.length : activeLegacy.length;

          setProjects(enrichedProjects);
          setGlobalStats({
            totalWorkers: totalWorkersReq.count || 0,
            checkedIn: totalCheckedIn
          });
        }
      } catch (err) {
        console.error('Error fetching sites for attendance', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSites();
    return () => { isMounted = false; };
  }, [search, tick]);

  return (
    <View className="flex-1 flex-col bg-gray-50 min-h-0 overflow-hidden">
      <TopNav title="Site Attendance" />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 md:px-8 py-6" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/labour')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Labour</Text>
        </Pressable>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-1">Select Construction Site</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Choose a project to view and manage worker attendance.</Text>
            <View className="flex-row items-center mt-1">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}</Text>
            </View>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, flexWrap: 'wrap', maxWidth: '100%', width: isMobile ? '100%' : 'auto' }}>
            <View className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100 flex-row items-center">
              <Ionicons name="people" size={20} color="#4F46E5" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-indigo-700 font-bold ml-2">{globalStats.checkedIn} / {globalStats.totalWorkers} Checked In Today</Text>
            </View>

            <SearchInput
              placeholder="Search sites..."
              value={search}
              onChangeText={setSearch}
              className={isMobile ? "w-full" : "w-80"}
            />
          </View>
        </View>

        <View className="flex-row flex-wrap gap-6">
          {loading ? (
            <View className="w-full py-20 items-center justify-center">
              <ActivityIndicator color="#4F46E5" />
            </View>
          ) : projects.length === 0 ? (
            <View className="w-full py-20 items-center justify-center bg-white rounded-xl border border-gray-100">
              <Ionicons name="business-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No active sites found.</Text>
            </View>
          ) : (
            projects.map(p => (
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                key={p.id}
                onPress={() => router.push(`/admin/attendance/${p.id}`)}
                className="w-full sm:w-80 max-w-full bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <View className="flex-row justify-between items-start mb-4">
                  <View className="w-12 h-12 bg-indigo-50 rounded-xl items-center justify-center">
                    <Ionicons name="calendar-outline" size={24} color="#4F46E5" />
                  </View>
                  <View className="bg-gray-100 px-2 py-1 rounded flex-row items-center">
                    <Ionicons name="time" size={12} color="#6B7280" />
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-gray-500 ml-1">Today: {format(new Date(), 'MMM dd')}</Text>
                  </View>
                </View>

                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1 group-hover:text-indigo-600 transition-colors">
                  {p.name}
                </Text>
                <View className="flex-row items-center mb-4">
                  <Ionicons name="location-outline" size={14} color="#9CA3AF" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 min-w-0 text-gray-500 text-sm ml-1">{p.location || 'Location Not Set'}</Text>
                </View>

                <View className="flex-row items-center justify-between border-t border-gray-50 pt-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm font-semibold">{p.checkedInToday} Checked In</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-indigo-600 font-semibold text-sm">View Logs →</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}
