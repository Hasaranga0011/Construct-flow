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

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch counts from various tables
        const today = new Date().toISOString().split('T')[0];
        const [projectsReq, labourReq, materialsReq, budgetReq] = await Promise.all([
          supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('status', 'Present'),
          // Assuming materials has global_stock_quantity and low_stock_threshold. Since we can't do raw sql in select, we can fetch them.
          // Wait, the prompt said: .lt('global_stock_quantity', supabase.raw('low_stock_threshold')) - supabase.raw doesn't exist in JS client.
          // A better way is to fetch all and filter in JS if there's no SQL function, or call an RPC. For now, fetch all materials and filter:
          supabase.from('materials').select('global_stock_quantity, low_stock_threshold'),
          supabase.from('projects').select('total_budget').eq('status', 'active')
        ]);

        let lowStockCount = 0;
        if (materialsReq.data) {
          lowStockCount = materialsReq.data.filter(m => (m.global_stock_quantity || 0) < (m.low_stock_threshold || 0)).length;
        }

        let totalBudget = 0;
        if (budgetReq.data) {
          totalBudget = budgetReq.data.reduce((sum, item) => sum + (Number(item.total_budget) || 0), 0);
        }

        if (isMounted) {
          setStats({
            activeProjects: projectsReq.count || 0,
            workersOnSite: labourReq.count || 0,
            lowStockAlerts: lowStockCount,
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
              <DelayRiskPanel />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View className="flex-row pb-6">
            <View className="flex-[2] mr-6">
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            <View className="flex-[1]">
              <RecentAlertsPanel />
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
