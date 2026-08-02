import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../../components/common/StatCard';
import { AttendanceTable } from '../../../components/labour/AttendanceTable';
import { PayrollSummary } from '../../../components/labour/PayrollSummary';
import { LabourDistributionChart } from '../../../components/labour/LabourDistributionChart';
import { CheckInWorkerModal } from '../../../components/labour/CheckInWorkerModal';
import { supabase } from '../../../lib/supabase';

export default function LabourScreen() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalWorkers: 0,
    checkedInToday: 0,
    activeSites: 0,
    pendingPayroll: 0,
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

        const today = new Date().toISOString().split('T')[0];

        const [workersReq, attendanceReq] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker'),
          supabase.from('labour').select('id, status, hours_worked').eq('date', today)
        ]);

        let checkedInCount = 0;
        let overtimeTotal = 0;

        if (attendanceReq.data) {
          checkedInCount = attendanceReq.data.filter(a => a.status === 'Present').length;
          overtimeTotal = attendanceReq.data.reduce((sum, a) => sum + Math.max(0, (Number(a.hours_worked) || 0) - 8), 0);
        }

        if (isMounted) {
          setStats({
            totalWorkers: workersReq.count || 0,
            checkedInToday: checkedInCount,
            activeSites: 0, // Keep 0 for now
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

  useEffect(() => {
    const channel = supabase.channel('public:labour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labour' }, () => {
        setRefreshTrigger(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCheckIn = () => {
    setModalVisible(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `Rs. ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `Rs. ${(val / 1000).toFixed(1)}K`;
    return `Rs. ${val}`;
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Labour Force" 
        actionLabel="+ Add Worker" 
        onActionPress={() => setModalVisible(true)} 
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
              indicatorText="" 
            />
            <StatCard 
              label="Checked In Today" 
              value={stats.checkedInToday.toString()} 
              indicatorText="" 
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
              indicatorText="" 
            />
          </View>

          {/* Quick Actions */}
          <View className="flex-row gap-4 mb-6">
            <Pressable onPress={() => router.push('/admin/attendance')} className="bg-indigo-50 px-4 py-3 rounded-lg border border-indigo-100 flex-row items-center">
              <Ionicons name="time-outline" size={20} color="#4F46E5" />
              <Text className="text-indigo-700 font-bold ml-2">Attendance Logs</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/admin/payroll')} className="bg-green-50 px-4 py-3 rounded-lg border border-green-100 flex-row items-center">
              <Ionicons name="cash-outline" size={20} color="#10B981" />
              <Text className="text-green-700 font-bold ml-2">Payroll Generation</Text>
            </Pressable>
          </View>

          {/* Main Content Layout */}
          <View className="flex-row">
            {/* Main Content Area (Attendance Table) */}
            <View className="flex-[2] mr-6">
              <AttendanceTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Payroll & Chart) */}
            <View className="flex-[1] flex-col">
              <PayrollSummary refreshTrigger={refreshTrigger} />
              <View className="h-64">
                <LabourDistributionChart refreshTrigger={refreshTrigger} />
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      <CheckInWorkerModal 
        visible={isModalVisible} 
        onClose={() => setModalVisible(false)} 
        onSuccess={handleCheckIn} 
      />
    </View>
  );
}
