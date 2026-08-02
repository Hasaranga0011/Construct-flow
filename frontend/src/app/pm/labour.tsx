import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AttendanceTable } from '../../components/labour/AttendanceTable';
import { PayrollSummary } from '../../components/labour/PayrollSummary';
import { LabourDistributionChart } from '../../components/labour/LabourDistributionChart';
import { supabase } from '../../lib/supabase';

export default function PMLabourScreen() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalWorkers: 0,
    checkedInToday: 0,
    activeSites: 0,
    pendingPayroll: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        
        const pmId = sessionData.session.user.id;
        if (isMounted) setCurrentUserId(pmId);

        const today = new Date().toISOString().split('T')[0];

        // Fetch PM's projects
        const { data: projects } = await supabase.from('projects').select('id').eq('pm_id', pmId).eq('status', 'active');
        const activeProjectIds = projects?.map(p => p.id) || [];

        let workersCount = 0;
        let checkedInCount = 0;
        let overtimeTotal = 0;

        if (activeProjectIds.length > 0) {
          const [workersReq, attendanceReq] = await Promise.all([
            supabase.from('labour').select('id', { count: 'exact', head: true }).in('assigned_project_id', activeProjectIds),
            supabase.from('attendance')
              .select('id, status, overtime_hours, projects!inner(pm_id)')
              .eq('date', today)
              .eq('projects.pm_id', pmId)
          ]);

          workersCount = workersReq.count || 0;
          if (attendanceReq.data) {
            checkedInCount = attendanceReq.data.filter(a => a.status === 'Present').length;
            overtimeTotal = attendanceReq.data.reduce((sum, a) => sum + (Number(a.overtime_hours) || 0), 0);
          }
        }

        if (isMounted) {
          setStats({
            totalWorkers: workersCount,
            checkedInToday: checkedInCount,
            activeSites: activeProjectIds.length,
            pendingPayroll: overtimeTotal
          });
        }
      } catch (error) {
        console.warn('Failed to load labour stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Labour Force (Your Projects)" 
        showAction={false}
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View className="flex-row justify-between mb-6 -mx-2">
            <StatCard 
              label="Total Workers" 
              value={stats.totalWorkers.toString()} 
              indicatorText="On your active sites" 
            />
            <StatCard 
              label="Checked In Today" 
              value={stats.checkedInToday.toString()} 
              indicatorText="Currently present" 
            />
            <StatCard 
              label="Today's Overtime" 
              value={`${stats.pendingPayroll} hrs`} 
              indicatorText="Additional hours" 
              indicatorType="warning" 
            />
            <StatCard 
              label="Active Sites" 
              value={stats.activeSites.toString()} 
              indicatorText="Managed by you" 
            />
          </View>

          {/* Main Content Layout */}
          <View className="flex-row">
            {/* Main Content Area (Attendance Table) */}
            <View className="flex-[2] mr-6">
              <AttendanceTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} pmId={currentUserId} />
            </View>
            
            {/* Side Panel (Payroll & Chart) */}
            <View className="flex-[1] flex-col">
              <PayrollSummary refreshTrigger={refreshTrigger} pmId={currentUserId} />
              <View className="h-64">
                <LabourDistributionChart refreshTrigger={refreshTrigger} pmId={currentUserId} />
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
