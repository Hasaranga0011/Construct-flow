import { Pressable , View, ActivityIndicator, Text } from 'react-native';
import { DashboardDetailLink } from '@/components/dashboard/DashboardDetailLink';
import { DashboardContent, DashboardHero, DashboardActions, DashboardSectionHeading } from '@/components/dashboard/DashboardLayout';
import { projectSites, dataError } from '@/services/siteData';
// Modified for Expo Go mobile compatibility
// Modified for Expo Go mobile compatibility
import React, { useEffect, useState, useCallback } from 'react';

import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { supabase } from '../../lib/supabase';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';
import { useResponsive } from '../../hooks/useResponsive';
import { useAssignedSites } from '../../hooks/useAssignedSites';
import { useAuth } from '../../context/AuthContext';
import { NoAssignedSites } from '../../components/common/NoAssignedSites';
import { todayKey } from '@/services/workerData';

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
        const today = todayKey();
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
    <View className="flex-1 bg-brand-light dark:bg-slate-950">
      <TopNav title="Site Manager Dashboard" actionLabel="Refresh" onActionPress={() => { loadStats(); } } />
      {loadError || assignmentError ? <View className="bg-red-50 p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700">{loadError || assignmentError}</Text><Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} accessibilityRole="button" onPress={refreshAssignments} className="text-brand-orange font-bold mt-2">Reload site assignments</Text></View> : null}

      {loading || sitesLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : assignedProjectIds.length === 0 ? (
        <NoAssignedSites />
      ) : (
        <DashboardContent>
          <DashboardHero eyebrow="Site operations" title="Site overview" description="Attendance, material availability and daily reports for your sites." icon="construct-outline" />


          <View className={isMobile ? "flex-row flex-wrap -mx-2 mb-6" : "flex-row gap-4 mb-6"}>
            <AnimatedCard delay={100} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/site-manager/sites')} 
                label="Assigned Sites"
                value={stats.assignedSites.toString()}
                indicatorText="Currently managing"
                fullWidth
                colorScheme="blue"
              />
            </AnimatedCard>

            <AnimatedCard delay={200} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/site-manager/attendance')} 
                label="Workers Present"
                value={stats.workersPresent.toString()}
                indicatorText="Checked in today"
                indicatorType="success"
                fullWidth
                colorScheme="emerald"
              />
            </AnimatedCard>

            <AnimatedCard delay={300} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/site-manager/materials')} 
                label="Low Stock Alerts"
                value={stats.pendingMaterials.toString()}
                indicatorText="Items below threshold"
                indicatorType={stats.pendingMaterials > 0 ? "danger" : "success"}
                fullWidth
                colorScheme="amber"
              />
            </AnimatedCard>

            <AnimatedCard delay={400} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/site-manager/issues')} 
                label="Active Issues"
                value={stats.activeIssues.toString()}
                indicatorText={stats.activeIssues > 0 ? "Requires attention" : "No open issues"}
                indicatorType={stats.activeIssues > 0 ? "danger" : "success"}
                fullWidth
                colorScheme="rose"
              />
            </AnimatedCard>
          </View>

          <DashboardActions actions={[
            { label: 'Manage Expenses', description: 'Review and add costs for your assigned sites', icon: 'receipt-outline', onPress: () => router.push('/site-manager/expenses') },
            { label:'Attendance', description:'Scan and manage check-ins', icon:'qr-code-outline', onPress:()=>router.push('/site-manager/attendance') },
            { label:'Materials', description:'Monitor stock and requests', icon:'cube-outline', onPress:()=>router.push('/site-manager/materials') },
            { label:'Daily reports', description:'Record the work completed', icon:'document-text-outline', onPress:()=>router.push('/site-manager/reports') },
            { label:'Site issues', description:'Report and resolve concerns', icon:'alert-circle-outline', onPress:()=>router.push('/site-manager/issues') },
            { label:'Milestones', description:'Update project progress', icon:'flag-outline', onPress:()=>router.push('/site-manager/milestones') },
          ]} />

          <DashboardDetailLink href="/site-manager/sites" label="site overview" interactive><View className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 md:p-6">
            <DashboardSectionHeading title="Site pulse" description="The latest signals from your assigned sites." icon="pulse-outline" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-slate-400 text-sm mt-2">
              Attendance, stock, and issue counts update from your assigned site data in real time.
            </Text>
            <View className="flex-row flex-wrap mt-5 gap-4">
              <Pressable accessibilityRole="link" accessibilityLabel="Open workers present details" onPress={() => router.push('/site-manager/attendance')}  className="flex-1 min-w-[45%] bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-slate-400 text-xs uppercase font-semibold">Workers present</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text dark:text-slate-100 mt-1">{stats.workersPresent}</Text>
              </Pressable>
              <Pressable accessibilityRole="link" accessibilityLabel="Open open site issues details" onPress={() => router.push('/site-manager/issues')}  className="flex-1 min-w-[45%] bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-slate-400 text-xs uppercase font-semibold">Open issues</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text dark:text-slate-100 mt-1">{stats.activeIssues}</Text>
              </Pressable>
            </View>
          </View></DashboardDetailLink>

        </DashboardContent>
      )}
    </View>
  );
}
