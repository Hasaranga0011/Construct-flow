import React, { useEffect, useState, useCallback } from 'react';
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
import { SearchInput } from '../../components/common/SearchInput';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useResponsive } from '../../hooks/useResponsive';
import { useRealtimeStats } from '../../hooks/useRealtimeStats';

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
  const [allProjects, setAllProjects] = useState<any[]>([]);

  const loadStats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      // Robust date calculation: match local timezone (e.g. Sri Lanka UTC+5:30) and UTC
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const utcDate = now.toISOString().split('T')[0];
      const todayDates = Array.from(new Set([localDate, utcDate]));

      const [projectsReq, labourReq, materialsReq] = await Promise.all([
        supabase.from('projects').select('id, name, total_budget, status'),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).in('date', todayDates).not('check_in_time', 'is', null).is('check_out_time', null),
        supabase.from('materials').select('current_stock, minimum_threshold'),
      ]);
      
      const allProj = projectsReq.data || [];
      setAllProjects(allProj);

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
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={true}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Admin Dashboard</Text>
            
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
              <StatCard 
                label="Active Projects" 
                value={stats.activeProjects.toString()} 
                indicatorText="Live tracking" 
                indicatorType="success" 
                colorScheme="blue"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Workers On Site" 
                value={stats.workersOnSite.toString()} 
                indicatorText="Currently checked in" 
                indicatorType={stats.workersOnSite > 0 ? "success" : "neutral"}
                colorScheme="emerald"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Low Stock Alerts" 
                value={stats.lowStockAlerts.toString()} 
                indicatorText="Requires ordering" 
                indicatorType={stats.lowStockAlerts > 0 ? "danger" : "success"} 
                colorScheme="amber"
                fullWidth
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
              <StatCard 
                label="Total Budget" 
                value={formatCurrency(stats.totalBudget)} 
                indicatorText="Approved estimates" 
                colorScheme="purple"
                fullWidth
              />
            </AnimatedCard>
          </View>

          {/* Center Row: Chart & Delay Risk */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            {/* Main Content Area (Chart) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2 }}>
              <CostTimelineChart />
            </View>
            
            {/* Side Panel (Delay Risk) */}
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <DelayRiskPanel />
            </View>
          </View>

          {/* New Charts Grid Row 1 */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <BudgetUtilizationChart />
            </View>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <MaterialsStockChart />
            </View>
          </View>

          {/* New Charts Grid Row 2 */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <PurchaseOrderPipelineChart />
            </View>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
              <MonthlyAttendanceChart />
            </View>
          </View>

          {/* Bottom Row: Active Projects & Recent Alerts */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, paddingBottom: 24 }}>
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 2 }}>
              <ActiveProjectsTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
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
