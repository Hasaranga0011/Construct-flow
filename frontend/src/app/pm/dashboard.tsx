// Modified for Expo Go mobile compatibility
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  const loadStats = useCallback(async () => {
    try {
      setError('');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;
      
      const userId = sessionData.session.user.id;
      setCurrentUserId(userId);

      // Fetch PM's projects directly via pm_id foreign key
      const projectsReq = await supabase
        .from('projects')
        .select('*', { count: 'exact' })
        .eq('pm_id', userId);

      if (projectsReq.error) throw projectsReq.error;
      const assignedProjectIds = projectsReq.data?.map(p => p.id) || [];

      let totalBudget = 0;
      let activeProjectsCount = 0;
      let lowStockAlerts = 0;
      let labourCount = 0;

      if (projectsReq.data) {
        activeProjectsCount = projectsReq.data.filter(p => ['active', 'in progress', 'ongoing'].includes(String(p.status).toLowerCase())).length;
        totalBudget = projectsReq.data.reduce((sum, item) => sum + (Number(item.total_budget ?? item.estimated_cost) || 0), 0);
      }

      if (assignedProjectIds.length > 0) {
        const materialsReq = await supabase.from('materials').select('current_stock, minimum_threshold').in('project_id', assignedProjectIds);
        if (materialsReq.error) throw materialsReq.error;
        lowStockAlerts = (materialsReq.data || []).filter(m => m.current_stock != null && m.minimum_threshold != null && Number(m.current_stock) < Number(m.minimum_threshold)).length;
        const attReq = await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('site_id', assignedProjectIds).eq('date', new Date().toISOString().slice(0, 10)).not('check_in_time', 'is', null).is('check_out_time', null);
        if (attReq.error) throw attReq.error;
        labourCount = attReq.count || 0;
      }

      setStats({
        activeProjects: activeProjectsCount,
        workersOnSite: labourCount,
        lowStockAlerts: lowStockAlerts,
        totalBudget: totalBudget,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
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
        searchConfig={{
          table: 'projects',
          searchColumn: 'name',
          secondaryColumn: 'location',
          titleColumn: 'name',
          subtitleColumn: 'location',
          routePrefix: '/pm/projects/',
          filterColumn: 'pm_id',
          filterValue: currentUserId
        }}
        searchEntityLabel="projects"
      />
      
      {!!error && <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} className="text-red-600 p-4" onPress={loadStats}>{error} Tap to retry.</Text>}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -8 }}>
            <AnimatedCard delay={100} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Active Projects" 
                value={stats.activeProjects.toString()} 
                indicatorText="Live tracking" 
                indicatorType="success" 
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Workers On Site" 
                value={stats.workersOnSite.toString()} 
                indicatorText="Currently checked in" 
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.lowStockAlerts.toString()} 
                indicatorText="Requires ordering" 
                indicatorType={stats.lowStockAlerts > 0 ? "danger" : "success"} 
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Total Budget" 
                value={formatCurrency(stats.totalBudget)} 
                indicatorText="Approved estimates" 
                fullWidth
              />
            </AnimatedCard>
          </View>

          {/* Center Row: Chart & Delay Risk */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            {/* Main Content Area (Chart) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2 }}>
              <CostTimelineChart pmId={currentUserId} />
            </View>
            
            {/* Side Panel (Delay Risk) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <DelayRiskPanel pmId={currentUserId} />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, paddingBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2 }}>
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} pmId={currentUserId} />
            </View>
            
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
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
