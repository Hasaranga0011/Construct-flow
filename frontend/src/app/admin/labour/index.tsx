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
import { SearchInput } from '@/components/common/SearchInput';

import { useResponsive } from '../../../hooks/useResponsive';
import { useTableRealtime } from '../../../hooks/useTableRealtime';

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
  const [workers, setWorkers] = useState<any[]>([]);
  const { isMobile } = useResponsive();
  const { tick, lastUpdated } = useTableRealtime(['legacy_labour', 'profiles', 'projects', 'salary_slips', 'workers', 'site_workers']);
  const liveTrigger = refreshTrigger + tick;

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        const today = new Date().toISOString().split('T')[0];

        const [workersReq, checkinsReq, sitesReq, labourReq, recordsReq, assignmentsReq] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, role', { count: 'exact' }).eq('role', 'worker'),
          supabase.from('legacy_labour').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'Present'),
          supabase.from('projects').select('id, name, status'),
          supabase.from('legacy_labour').select('hours_worked').eq('date', today).eq('status', 'Present'),
          supabase.from('workers').select('*'),
          supabase.from('site_workers').select('worker_id, project_id')
        ]);
        
        let overtimeHrs = 0;
        if (labourReq.data) {
          labourReq.data.forEach((r: any) => {
             const hrs = Number(r.hours_worked) || 0;
             if (hrs > 8) overtimeHrs += (hrs - 8);
          });
        }

        if (isMounted) {
          const projectsById = new Map((sitesReq.data || []).map(p => [p.id, p.name]));
          setWorkers((workersReq.data || []).map(profile => {
            const record = (recordsReq.data || []).find(w => w.user_id === profile.id || w.id === profile.id);
            const sites = [...new Set((assignmentsReq.data || [])
              .filter(a => a.worker_id === record?.id || a.worker_id === profile.id)
              .map(a => projectsById.get(a.project_id)).filter(Boolean))];
            return { ...profile, search_detail: [record?.skill_type || profile.role,
              sites.length ? sites.join(', ') : (assignmentsReq.error ? 'Site unavailable' : 'No assigned site'), profile.email].filter(Boolean).join(' | ') };
          }));
          setStats({
            totalWorkers: workersReq.count || 0,
            checkedInToday: checkinsReq.count || 0,
            activeSites: (sitesReq.data || []).filter(p => ['active', 'in progress'].includes(String(p.status).toLowerCase())).length, 
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
  }, [liveTrigger]);

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
        <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Workers</Text>
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}</Text>
            </View>
            
            <SearchInput 
              placeholder="Search workers..."
              entityLabel="workers"
              items={workers} 
              value={searchQuery} 
              onChangeText={setSearchQuery} 
              className={isMobile ? "w-full" : "w-64"}
              config={{
                table: 'profiles',
                searchColumn: 'full_name',
                secondaryColumn: 'email',
                titleColumn: 'full_name',
                subtitleColumn: 'search_detail',
                routePrefix: '/admin/users/',
                filterColumn: 'role',
                filterValue: 'worker'
              }}
            />
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
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/attendance')} className="bg-indigo-50 px-4 py-3 rounded-lg border border-indigo-100 flex-row items-center">
              <Ionicons name="time-outline" size={20} color="#4F46E5" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-indigo-700 font-bold ml-2">Attendance Logs</Text>
            </Pressable>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/payroll')} className="bg-green-50 px-4 py-3 rounded-lg border border-green-100 flex-row items-center">
              <Ionicons name="cash-outline" size={20} color="#10B981" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-700 font-bold ml-2">Payroll Generation</Text>
            </Pressable>
          </View>

          {/* Main Content Layout */}
          <View style={isMobile ? { flexDirection: 'column', gap: 16 } : { flexDirection: 'row' }}>
            {/* Main Content Area (Attendance Table) */}
            <View style={isMobile ? { width: '100%' } : { flex: 2, marginRight: 24 }}>
              <AttendanceTable refreshTrigger={liveTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Payroll & Chart) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1, flexDirection: 'column', gap: 24 }}>
              <PayrollSummary refreshTrigger={liveTrigger} />
              <View style={isMobile ? { height: 256, marginTop: 16 } : { height: 256 }}>
                <LabourDistributionChart refreshTrigger={liveTrigger} />
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
