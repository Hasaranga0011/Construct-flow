// Modified for Expo Go mobile compatibility
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { CostTimelineChart } from '../../components/dashboard/CostTimelineChart';
import { DelayRiskPanel } from '../../components/dashboard/DelayRiskPanel';
import { ActiveProjectsTable } from '../../components/dashboard/ActiveProjectsTable';
import { RecentAlertsPanel } from '../../components/dashboard/RecentAlertsPanel';
import { NewProjectModal } from '../../components/dashboard/NewProjectModal';
import { supabase } from '../../lib/supabase';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';
import { useResponsive } from '../../hooks/useResponsive';

export default function DashboardScreen() {
  const { isMobile } = useResponsive();
  const [stats, setStats] = useState({
    activeProjects: 0,
    workersOnSite: 0,
    lowStockAlerts: 0,
    totalBudget: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  const loadStats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      
      const userId = sessionData.session.user.id;
      setCurrentUserId(userId);

      // Fetch PM's projects directly via pm_id foreign key
      const projectsReq = await supabase
        .from('projects')
        .select('id, total_budget, estimated_cost', { count: 'exact' })
        .eq('status', 'active')
        .eq('pm_id', userId);

      const assignedProjectIds = projectsReq.data?.map(p => p.id) || [];

      let totalBudget = 0;
      let activeProjectsCount = 0;
      let lowStockAlerts = 0;
      let labourCount = 0;

      if (projectsReq.data) {
        activeProjectsCount = projectsReq.count || 0;
        totalBudget = projectsReq.data.reduce((sum, item) => sum + (Number(item.total_budget || item.estimated_cost) || 0), 0);
      }

      if (assignedProjectIds.length > 0) {
        const materialsReq = await supabase
          .from('material_requests')
          .select('id, project_id', { count: 'exact' })
          .eq('status', 'Pending Approval')
          .in('project_id', assignedProjectIds);

        lowStockAlerts = materialsReq.count || 0;

        // Use canonical attendance table (not legacy labour) for workers-on-site count.
        const today = new Date().toISOString().split('T')[0];
        // Get site_manager_sites IDs for these projects to filter attendance.
        const siteAssignmentsReq = await supabase
          .from('site_manager_sites')
          .select('id')
          .in('project_id', assignedProjectIds);
        const siteIds = siteAssignmentsReq.data?.map(s => s.id) || [];

        if (siteIds.length > 0) {
          const attReq = await supabase
            .from('attendance')
            .select('id', { count: 'exact', head: true })
            .in('site_id', siteIds)
            .eq('date', today)
            .not('check_in_time', 'is', null)
            .is('check_out_time', null);
          labourCount = attReq.count || 0;
        }
      }

      setStats({
        activeProjects: activeProjectsCount,
        workersOnSite: labourCount,
        lowStockAlerts: lowStockAlerts,
        totalBudget: totalBudget,
      });
    } catch (error) {
      console.warn('Failed to load PM dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, refreshTrigger]);
  // Broad Realtime: catches attendance, materials, milestones changes.
  useRealtimeStats(loadStats);

  // Targeted Realtime: fires when a new project is assigned to this PM.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`pm-projects:${currentUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects',
        filter: `pm_id=eq.${currentUserId}`,
      }, () => loadStats())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, loadStats]);




  const handleProjectCreated = () => {
    setModalVisible(false);
    // Incrementing this triggers useEffect here and in ActiveProjectsTable
    setRefreshTrigger(prev => prev + 1);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Dashboard" 
        actionLabel="+ New Project" 
        onActionPress={() => setModalVisible(true)} 
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View className={isMobile ? "flex-row flex-wrap -mx-2 mb-6" : "flex-row gap-4 mb-6"}>
            <AnimatedCard delay={100} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Active Projects" 
                value={stats.activeProjects.toString()} 
                indicatorText="Live tracking" 
                indicatorType="success" 
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Workers On Site" 
                value={stats.workersOnSite.toString()} 
                indicatorText="Currently checked in" 
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.lowStockAlerts.toString()} 
                indicatorText="Requires ordering" 
                indicatorType={stats.lowStockAlerts > 0 ? "danger" : "success"} 
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={isMobile ? { width: '50%', paddingHorizontal: 8, marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Total Budget" 
                value={formatCurrency(stats.totalBudget)} 
                indicatorText="Approved estimates" 
              />
            </AnimatedCard>
          </View>

          {/* Center Row: Chart & Delay Risk */}
          <View className={isMobile ? "flex-col gap-6 mb-6" : "flex-row gap-6 mb-6"}>
            {/* Main Content Area (Chart) */}
            <View className="flex-[2] w-full">
              <CostTimelineChart />
            </View>
            
            {/* Side Panel (Delay Risk) */}
            <View className="flex-[1] w-full">
              <DelayRiskPanel pmId={currentUserId} />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View className={isMobile ? "flex-col gap-6 pb-6" : "flex-row gap-6 pb-6"}>
            <View className="flex-[2] w-full">
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} pmId={currentUserId} />
            </View>
            
            <View className="flex-[1] w-full">
              <RecentAlertsPanel pmId={currentUserId} />
            </View>
          </View>
          
        </ScrollView>
      )}

      <NewProjectModal 
        visible={isModalVisible} 
        onClose={() => setModalVisible(false)} 
        onSuccess={handleProjectCreated} 
      />
    </View>
  );
}
