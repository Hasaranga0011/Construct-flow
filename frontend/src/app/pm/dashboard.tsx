import React, { useEffect, useState } from 'react';
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

export default function DashboardScreen() {
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

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        
        const userId = sessionData.session.user.id;
        if (isMounted) setCurrentUserId(userId);

        // 1. Fetch Assigned Projects from pm_projects
        const { data: pmAssignments } = await supabase
          .from('pm_projects')
          .select('project_id')
          .eq('pm_id', userId);
        
        const assignedProjectIds = pmAssignments?.map(a => a.project_id) || [];
        
        let totalBudget = 0;
        let activeProjectsCount = 0;
        let lowStockAlerts = 0;
        let labourCount = 0;

        if (assignedProjectIds.length > 0) {
          // Fetch projects stats
          const projectsReq = await supabase
            .from('projects')
            .select('id, estimated_cost, total_budget', { count: 'exact' })
            .eq('status', 'active')
            .in('id', assignedProjectIds);
            
          if (projectsReq.data) {
            activeProjectsCount = projectsReq.count || 0;
            totalBudget = projectsReq.data.reduce((sum, item) => sum + (Number(item.total_budget || item.estimated_cost) || 0), 0);
          }

          // Fetch material alerts for assigned projects
          const materialsReq = await supabase
            .from('material_requests')
            .select('id, project_id', { count: 'exact' })
            .eq('status', 'Pending Approval')
            .in('project_id', assignedProjectIds);
            
          lowStockAlerts = materialsReq.count || 0;

          // Fetch labour for these specific projects
          const labourReq = await supabase
            .from('labour')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Present')
            .in('assigned_project_id', assignedProjectIds);
            
          labourCount = labourReq.count || 0;
        }

        if (isMounted) {
          setStats({
            activeProjects: activeProjectsCount,
            workersOnSite: labourCount,
            lowStockAlerts: lowStockAlerts,
            totalBudget: totalBudget,
          });
        }
      } catch (error) {
        console.warn('Failed to load dashboard stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

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
          <View className="flex-row justify-between mb-6 -mx-2">
            <AnimatedCard delay={100} style={{ flex: 1 }}>
              <StatCard 
                label="Active Projects" 
                value={stats.activeProjects.toString()} 
                indicatorText="Live tracking" 
                indicatorType="success" 
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={{ flex: 1 }}>
              <StatCard 
                label="Workers On Site" 
                value={stats.workersOnSite.toString()} 
                indicatorText="Currently checked in" 
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={{ flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.lowStockAlerts.toString()} 
                indicatorText="Requires ordering" 
                indicatorType={stats.lowStockAlerts > 0 ? "danger" : "success"} 
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={{ flex: 1 }}>
              <StatCard 
                label="Total Budget" 
                value={formatCurrency(stats.totalBudget)} 
                indicatorText="Approved estimates" 
              />
            </AnimatedCard>
          </View>

          {/* Center Row: Chart & Delay Risk */}
          <View className="flex-row mb-6">
            {/* Main Content Area (Chart) */}
            <View className="flex-[2] mr-6">
              <CostTimelineChart />
            </View>
            
            {/* Side Panel (Delay Risk) */}
            <View className="flex-[1]">
              <DelayRiskPanel pmId={currentUserId} />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View className="flex-row pb-6">
            <View className="flex-[2] mr-6">
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} pmId={currentUserId} />
            </View>
            
            <View className="flex-[1]">
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
