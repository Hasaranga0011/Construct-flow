import { projectSites, dataError } from '@/services/siteData';
// Modified for Expo Go mobile compatibility
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, ActivityIndicator, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { supabase } from '../../lib/supabase';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';
import { useResponsive } from '../../hooks/useResponsive';
import { useAssignedSites } from '../../hooks/useAssignedSites';
import { useAuth } from '../../context/AuthContext';
import { NoAssignedSites } from '../../components/common/NoAssignedSites';

export default function SiteManagerDashboard() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState('');
  const { assignedProjectIds, loading: sitesLoading, error: assignmentError, refresh: refreshAssignments } = useAssignedSites(user?.id);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    assignedSites: 0,
    workersPresent: 0,
    pendingMaterials: 0,
    activeIssues: 0,
  });

  const loadStats = useCallback(async () => {
    if (!user?.id || sitesLoading) return;

    try {
      setLoading(true);
      setLoadError('');

      const { data: projectsData, error: projectsDataError } = assignedProjectIds.length
        ? await supabase.from('projects').select('id').in('id', assignedProjectIds)
        : { data: [], error: null };
      if (projectsDataError) throw projectsDataError;

      const projectIds = (projectsData?.map(p => p.id) || []).filter((id): id is string => Boolean(id));
      const siteIds = (await projectSites(projectIds)).map(s => s.id);

      let workersPresent = 0;
      let pendingMaterials = 0;
      let activeIssues = 0;

      if (projectIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const [attReq, materialsReq, issuesReq] = await Promise.all([
          supabase
            .from('attendance')
            .select('id', { count: 'exact', head: true })
            .in('site_id', siteIds)
            .eq('date', today)
            .not('check_in_time', 'is', null)
            .is('check_out_time', null),
          supabase
            .from('materials')
            .select('id, current_stock, minimum_threshold')
            .in('project_id', projectIds),
          siteIds.length
            ? supabase
                .from('issues')
                .select('id', { count: 'exact', head: true })
                .in('site_id', siteIds)
                .neq('status', 'Resolved')
            : Promise.resolve({ count: 0, error: null } as any),
        ]);

        if (attReq.error) throw attReq.error;
        workersPresent = attReq.count || 0;

        if (materialsReq.error) throw materialsReq.error;
        if (materialsReq.data) {
          pendingMaterials = materialsReq.data.filter(
            m => (m.current_stock ?? 0) < (m.minimum_threshold ?? 0)
          ).length;
        }

        if (issuesReq.error) throw issuesReq.error;
        activeIssues = issuesReq.count || 0;
      }

      setStats({
        assignedSites: projectIds.length,
        workersPresent,
        pendingMaterials,
        activeIssues,
      });

    } catch (error) {
      setLoadError(dataError(error));
    } finally {
      setLoading(false);
    }
  }, [user?.id, assignedProjectIds, sitesLoading]);

  useEffect(() => { loadStats(); }, [loadStats]);
  // Realtime: re-fetch when attendance or materials change
  useRealtimeStats(loadStats, true);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Site Manager Dashboard" actionLabel="Refresh" onActionPress={() => { loadStats(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}
      
      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          
          <View className={isMobile ? "flex-row flex-wrap -mx-2 mb-6" : "flex-row gap-4 mb-6"}>
            <AnimatedCard delay={100} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Assigned Sites" 
                value={stats.assignedSites.toString()} 
                indicatorText="Currently managing" 
                colorScheme="blue"
              />
            </AnimatedCard>
            
            <AnimatedCard delay={200} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Workers Present" 
                value={stats.workersPresent.toString()} 
                indicatorText="Checked in today" 
                indicatorType="success"
                colorScheme="emerald"
              />
            </AnimatedCard>
            
            <AnimatedCard delay={300} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.pendingMaterials.toString()} 
                indicatorText="Items below threshold" 
                indicatorType={stats.pendingMaterials > 0 ? "danger" : "success"}
                colorScheme="amber"
              />
            </AnimatedCard>
            
            <AnimatedCard delay={400} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Active Issues" 
                value={stats.activeIssues.toString()} 
                indicatorText="Requires attention"
                indicatorType={stats.activeIssues > 0 ? "danger" : "success"}
                colorScheme="rose"
              />
            </AnimatedCard>
          </View>

          {/* Quick Actions Grid */}
          <View className="mb-6">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-3">Quick Actions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Pressable
                onPress={() => router.push('/site-manager/attendance')}
                style={{ flex: isMobile ? 1 : undefined, minWidth: isMobile ? '45%' : 160, minHeight: 44 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-center gap-3 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-lg bg-orange-50 items-center justify-center">
                  <Ionicons name="qr-code-outline" size={22} color="#F97316" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-bold text-sm text-brand-text">Attendance</Text>
                  <Text numberOfLines={1} className="text-xs text-gray-500">Scan & Check-in</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push('/site-manager/materials')}
                style={{ flex: isMobile ? 1 : undefined, minWidth: isMobile ? '45%' : 160, minHeight: 44 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-center gap-3 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-lg bg-amber-50 items-center justify-center">
                  <Ionicons name="cube-outline" size={22} color="#D97706" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-bold text-sm text-brand-text">Materials</Text>
                  <Text numberOfLines={1} className="text-xs text-gray-500">Stock & Orders</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push('/site-manager/issues')}
                style={{ flex: isMobile ? 1 : undefined, minWidth: isMobile ? '45%' : 160, minHeight: 44 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-center gap-3 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-lg bg-rose-50 items-center justify-center">
                  <Ionicons name="alert-circle-outline" size={22} color="#E11D48" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-bold text-sm text-brand-text">Site Issues</Text>
                  <Text numberOfLines={1} className="text-xs text-gray-500">Report & Track</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push('/site-manager/milestones')}
                style={{ flex: isMobile ? 1 : undefined, minWidth: isMobile ? '45%' : 160, minHeight: 44 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-center gap-3 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-lg bg-blue-50 items-center justify-center">
                  <Ionicons name="flag-outline" size={22} color="#2563EB" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-bold text-sm text-brand-text">Milestones</Text>
                  <Text numberOfLines={1} className="text-xs text-gray-500">Update Progress</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push('/site-manager/reports')}
                style={{ flex: isMobile ? 1 : undefined, minWidth: isMobile ? '45%' : 160, minHeight: 44 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex-row items-center gap-3 active:bg-gray-50"
              >
                <View className="w-10 h-10 rounded-lg bg-emerald-50 items-center justify-center">
                  <Ionicons name="document-text-outline" size={22} color="#059669" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-bold text-sm text-brand-text">Daily Reports</Text>
                  <Text numberOfLines={1} className="text-xs text-gray-500">Log Site Work</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Live Site Signals</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-2">
              Attendance, stock, and issue counts update from your assigned site data in real time.
            </Text>
            <View className="flex-row flex-wrap mt-5 gap-4">
              <View className="flex-1 min-w-[45%] bg-gray-50 rounded-lg p-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs uppercase font-semibold">Workers present</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mt-1">{stats.workersPresent}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-gray-50 rounded-lg p-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs uppercase font-semibold">Open issues</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mt-1">{stats.activeIssues}</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      )}
    </View>
  );
}
