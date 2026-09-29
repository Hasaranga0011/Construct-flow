import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../../components/common/StatCard';
import { AttendanceTable } from '../../../components/labour/AttendanceTable';
import { PayrollSummary } from '../../../components/labour/PayrollSummary';
import { LabourDistributionChart } from '../../../components/labour/LabourDistributionChart';
import { CheckInWorkerModal } from '../../../components/labour/CheckInWorkerModal';
import { supabase } from '../../../lib/supabase';

import { useResponsive } from '../../../hooks/useResponsive';

export default function LabourForceScreen() {
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
  const { isMobile } = useResponsive();

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        const today = new Date().toISOString().split('T')[0];

        const [workersReq, checkinsReq, sitesReq, labourReq] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker'),
          supabase.from('labour').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'Present'),
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('labour').select('hours_worked').eq('date', today).eq('status', 'Present')
        ]);
        
        let overtimeHrs = 0;
        if (labourReq.data) {
          labourReq.data.forEach((r: any) => {
             const hrs = Number(r.hours_worked) || 0;
             if (hrs > 8) overtimeHrs += (hrs - 8);
          });
        }

        if (isMounted) {
          setStats({
            totalWorkers: workersReq.count || 0,
            checkedInToday: checkinsReq.count || 0,
            activeSites: sitesReq.count || 0, 
            pendingPayroll: Math.round(overtimeHrs), 
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

  const handleWorkerCreated = () => {
    setModalVisible(false);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Labour Force" 
        actionLabel="+ Add Worker" 
        onActionPress={() => router.push('/admin/users/create')} 
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <ScrollView className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12 }}>
            <Text className="text-2xl font-bold text-brand-text">All Workers</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search workers..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Top Stat Cards Row */}
          <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -8 }}>
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
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24 }}>
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
          <View style={isMobile ? { flexDirection: 'column', gap: 16 } : { flexDirection: 'row' }}>
            {/* Main Content Area (Attendance Table) */}
            <View style={isMobile ? { width: '100%' } : { flex: 2, marginRight: 24 }}>
              <AttendanceTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Payroll & Chart) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1, flexDirection: 'column', gap: 24 }}>
              <PayrollSummary refreshTrigger={refreshTrigger} />
              <View style={isMobile ? { height: 256, marginTop: 16 } : { height: 256 }}>
                <LabourDistributionChart refreshTrigger={refreshTrigger} />
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      <CheckInWorkerModal 
        visible={isModalVisible} 
        onClose={() => setModalVisible(false)} 
        onSuccess={handleWorkerCreated} 
      />
    </View>
  );
}
