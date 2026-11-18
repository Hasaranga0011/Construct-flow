import { DashboardDetailLink } from '@/components/dashboard/DashboardDetailLink';
import { DashboardContent, DashboardHero, DashboardActions, DashboardSectionHeading } from '@/components/dashboard/DashboardLayout';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { CostTimelineChart } from '../../components/dashboard/CostTimelineChart';
import { BudgetUtilizationChart } from '../../components/dashboard/BudgetUtilizationChart';
import { MaterialsStockChart } from '../../components/dashboard/MaterialsStockChart';
import { PurchaseOrderPipelineChart } from '../../components/dashboard/PurchaseOrderPipelineChart';
import { MonthlyAttendanceChart } from '../../components/dashboard/MonthlyAttendanceChart';
import { DelayRiskPanel } from '../../components/dashboard/DelayRiskPanel';
import { ActiveProjectsTable } from '../../components/dashboard/ActiveProjectsTable';
import { RecentAlertsPanel } from '../../components/dashboard/RecentAlertsPanel';
import { NewProjectModal } from '../../components/dashboard/NewProjectModal';
import { supabase } from '../../lib/supabase';
import { SearchInput } from '../../components/common/SearchInput';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { useResponsive } from '../../hooks/useResponsive';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';
import { LoadingState, ErrorState } from '@/components/ui';
import { todayKey } from '@/services/workerData';

export default function DashboardScreen() {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [stats, setStats] = useState({
    activeProjects: 0,
    workersOnSite: 0,
    lowStockAlerts: 0,
    totalBudget: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const loadStats = useCallback(async () => {
    try {
      setLoadError('');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      // Keep today's attendance aligned with the Sri Lankan workday.
      const todayDates = [todayKey()];

      const [projectsReq, labourReq, materialsReq] = await Promise.all([
        supabase.from('projects').select('id, name, total_budget, status'),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).in('date', todayDates).not('check_in_time', 'is', null).is('check_out_time', null),
        supabase.from('materials').select('current_stock, minimum_threshold'),
      ]);
      for (const response of [projectsReq, labourReq, materialsReq]) if (response.error) throw response.error;

      const allProj = projectsReq.data || [];

      const activeProj = allProj.filter(p => ['active', 'Active', 'In Progress', 'in progress'].includes(p.status || ''));
      const totalBudget = activeProj.reduce((sum, item) => sum + (Number(item.total_budget) || 0), 0);

      let lowStockCount = 0;
      if (materialsReq.data) {
        lowStockCount = materialsReq.data.filter(m => (m.current_stock || 0) < (m.minimum_threshold || 0)).length;
      }

      setStats({
        activeProjects: activeProj.length,
        workersOnSite: labourReq.count || 0,
        lowStockAlerts: lowStockCount,
        totalBudget: totalBudget,
      });
    } catch (error) {
      setLoadError('Dashboard data could not be loaded. Please try again.');
      console.warn('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Realtime subscription for attendance, projects, and materials
  const handleRealtimeRefetch = useCallback(() => {
    loadStats();
    setRefreshTrigger(prev => prev + 1);
  }, [loadStats]);

  useRealtimeStats(handleRealtimeRefetch);

  const handleProjectCreated = () => {
    setModalVisible(false);
    handleRealtimeRefetch();
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="flex-1 bg-brand-light dark:bg-slate-950">
      <TopNav
        title="Admin Dashboard"
        actionLabel="+ New Project"
        onActionPress={() => setModalVisible(true)}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingState message="Loading your operations overview…" />
        </View>
      ) : loadError ? <ErrorState message={loadError} onRetry={() => { setLoading(true); void loadStats(); }} /> : (
        <DashboardContent>
          <DashboardHero eyebrow="Administration" title="Operations overview" description="Project activity, site attendance and budget performance." icon="grid-outline" />
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-slate-900 dark:text-white">Portfolio overview</Text>

            <SearchInput
              placeholder="Search projects..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className={isMobile ? "w-full" : "w-80"}
              config={{
                table: 'projects',
                searchColumn: 'name',
                secondaryColumn: 'location',
                titleColumn: 'name',
                subtitleColumn: 'location',
                routePrefix: '/admin/projects/'
              }}
            />
          </View>

          {/* Top Stat Cards Row */}
          <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
            <AnimatedCard delay={100} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/admin/projects')} 
                label="Active Projects"
                value={stats.activeProjects.toString()}
                indicatorText="Live tracking"
                indicatorType="success"
                colorScheme="blue"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/admin/labour')} 
                label="Workers On Site"
                value={stats.workersOnSite.toString()}
                indicatorText="Currently checked in"
                indicatorType={stats.workersOnSite > 0 ? "success" : "neutral"}
                colorScheme="emerald"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/admin/materials')} 
                label="Low Stock Alerts"
                value={stats.lowStockAlerts.toString()}
                indicatorText="Requires ordering"
                indicatorType={stats.lowStockAlerts > 0 ? "danger" : "success"}
                colorScheme="amber"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard onPress={() => router.push('/admin/reports/projects')} 
                label="Total Budget"
                value={formatCurrency(stats.totalBudget)}
                indicatorText="Approved estimates"
                colorScheme="purple"
                fullWidth
              />
            </AnimatedCard>
          </View>

          <DashboardActions actions={[
            { label: 'Project workspace', description: 'Progress, people and project details', icon: 'business-outline', onPress: () => router.push('/admin/projects') },
            { label: 'Materials & orders', description: 'Stock levels and purchasing', icon: 'cube-outline', onPress: () => router.push('/admin/materials') },
            { label: 'Attendance & payroll', description: 'Review your team’s working records', icon: 'people-outline', onPress: () => router.push('/admin/payroll') },
          ]} />
          <DashboardSectionHeading title="Performance & planning" description="Budget visibility and the signals that need your attention." icon="analytics-outline" />
          {/* Center Row: Chart & Delay Risk */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            {/* Main Content Area (Chart) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/reports/projects" label="project cost history"><CostTimelineChart /></DashboardDetailLink>
            </View>

            {/* Side Panel (Delay Risk) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/insights" label="project risk" interactive><DelayRiskPanel /></DashboardDetailLink>
            </View>
          </View>

          {/* New Charts Grid Row 1 */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/reports/projects" label="project budgets"><BudgetUtilizationChart /></DashboardDetailLink>
            </View>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/materials/stock" label="stock details"><MaterialsStockChart /></DashboardDetailLink>
            </View>
          </View>

          {/* New Charts Grid Row 2 */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/materials/orders" label="purchase orders"><PurchaseOrderPipelineChart /></DashboardDetailLink>
            </View>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/labour" label="attendance records"><MonthlyAttendanceChart /></DashboardDetailLink>
            </View>
          </View>

          <DashboardSectionHeading title="Your project workspace" description="Current projects and recent updates from your team." icon="layers-outline" />
          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, paddingBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/projects" label="project register" interactive><ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} /></DashboardDetailLink>
            </View>

            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
              <DashboardDetailLink href="/admin/notifications" label="notifications" interactive><RecentAlertsPanel /></DashboardDetailLink>
            </View>
          </View>

        </DashboardContent>
      )}

      <NewProjectModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={handleProjectCreated}
      />
    </View>
  );
}
