import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text, TextInput } from 'react-native';
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
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { Ionicons } from '@expo/vector-icons';
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

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch counts from various tables
        const today = new Date().toISOString().split('T')[0];
        const [projectsReq, labourReq, materialsReq, budgetReq] = await Promise.all([
          supabase.from('projects').select('*', { count: 'exact', head: true }).in('status', ['active', 'Active', 'In Progress', 'in progress']),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('status', 'Present').is('check_out_time', null),
          // Assuming materials has current_stock and minimum_threshold. Since we can't do raw sql in select, we can fetch them.
          // Wait, the prompt said: .lt('current_stock', supabase.raw('minimum_threshold')) - supabase.raw doesn't exist in JS client.
          // A better way is to fetch all and filter in JS if there's no SQL function, or call an RPC. For now, fetch all materials and filter:
          supabase.from('materials').select('current_stock, minimum_threshold'),
          supabase.from('projects').select('total_budget').in('status', ['active', 'Active', 'In Progress', 'in progress'])
        ]);

        let lowStockCount = 0;
        if (materialsReq.data) {
          lowStockCount = materialsReq.data.filter(m => (m.current_stock || 0) < (m.minimum_threshold || 0)).length;
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
    
    // Realtime subscription for Bug 9
    const channel = supabase
      .channel('admin-dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(channel);
    };
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
        title="Admin Dashboard" 
        actionLabel="+ New Project" 
        onActionPress={() => setModalVisible(true)} 
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12 }}>
            <Text className="text-2xl font-bold text-brand-text">Admin Dashboard</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search projects..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

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
          <View className="flex-col lg:flex-row mb-6 gap-6">
            {/* Main Content Area (Chart) */}
            <View className="flex-[2] w-full">
              <CostTimelineChart />
            </View>
            
            {/* Side Panel (Delay Risk) */}
            <View className="flex-[1] w-full">
              <DelayRiskPanel />
            </View>
          </View>

          {/* New Charts Grid Row 1 */}
          <View className="flex-col lg:flex-row mb-6 gap-6">
            <View className="flex-1 w-full">
              <BudgetUtilizationChart />
            </View>
            <View className="flex-1 w-full">
              <MaterialsStockChart />
            </View>
          </View>

          {/* New Charts Grid Row 2 */}
          <View className="flex-col lg:flex-row mb-6 gap-6">
            <View className="flex-1 w-full">
              <PurchaseOrderPipelineChart />
            </View>
            <View className="flex-1 w-full">
              <MonthlyAttendanceChart />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View className="flex-col lg:flex-row pb-6 gap-6">
            <View className="flex-[2] w-full">
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            <View className="flex-[1] w-full">
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
