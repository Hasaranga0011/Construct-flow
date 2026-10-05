import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';
import { useTableRealtime } from '../../../hooks/useTableRealtime';

export default function AdminPayrollIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tick, lastUpdated } = useTableRealtime(['legacy_labour', 'profiles', 'salary_slips']);
  
  const [stats, setStats] = useState({ totalPending: 0, lastRun: 'Never', nextRun: 'End of Month' });

  useEffect(() => {
    let isMounted = true;
    const fetchPayrollOverview = async () => {
      try {
        // Fetch all workers
        const { data: workerData, error: workerErr } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'worker');
          
        if (workerErr) throw workerErr;
        
        // Fetch all attendance logs
        const { data: attData, error: attErr } = await supabase
          .from('legacy_labour')
          .select('worker_name, status, hours_worked');
          
        if (attErr) throw attErr;

        if (isMounted) {
          let totalPending = 0;
          const defaultDailyRate = 3500;
          
          const enrichedWorkers = (workerData || []).map(w => {
            const records = (attData || []).filter(a => a.worker_name === w.full_name && a.status === 'Present');
            const totalDays = records.length;
            
            // Calculate overtime dynamically
            let totalOvertime = 0;
            records.forEach(r => {
              const hours = Number(r.hours_worked) || 0;
              if (hours > 8) {
                totalOvertime += (hours - 8);
              }
            });
            
            // Simplified calculation
            const overtimeRate = (defaultDailyRate / 8) * 1.5;
            const pendingAmount = (totalDays * defaultDailyRate) + (totalOvertime * overtimeRate);
            
            totalPending += pendingAmount;
            
            return {
              ...w,
              name: w.full_name, // Map for ui
              role: 'Worker',
              daily_rate: defaultDailyRate,
              totalDays,
              totalOvertime,
              pendingAmount
            };
          }).sort((a, b) => b.pendingAmount - a.pendingAmount);
          
          setWorkers(enrichedWorkers);
          setStats({
            totalPending,
            lastRun: format(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy'),
            nextRun: format(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy')
          });
        }
      } catch (err) {
        console.error('Error fetching payroll overview', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchPayrollOverview();
    return () => { isMounted = false; };
  }, [tick]);

  const filteredWorkers = workers.filter(w => 
    w.name?.toLowerCase().includes(search.toLowerCase()) ||
    w.nic?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav title="Payroll Management" />
      
      <ScrollView className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/admin/labour')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Labour</Text>
        </Pressable>

        {/* Header Action Card */}
        <View className="bg-green-700 rounded-2xl p-8 shadow-sm mb-8 flex-row justify-between items-center overflow-hidden relative">
          <View className="absolute right-0 top-0 opacity-10">
            <Ionicons name="cash" size={200} color="#FFFFFF" />
          </View>
          
          <View className="z-10">
            <Text className="text-green-200 text-sm font-bold uppercase tracking-wider mb-2">Estimated Pending Liabilities</Text>
            <Text className="text-4xl font-extrabold text-white mb-2">Rs. {stats.totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            <View className="flex-row items-center mt-2">
              <View className="bg-green-800/50 px-3 py-1 rounded border border-green-600/50 mr-4">
                <Text className="text-green-100 text-xs">Last Run: {stats.lastRun}</Text>
              </View>
              <View className="bg-green-800/50 px-3 py-1 rounded border border-green-600/50">
                <Text className="text-green-100 text-xs">Next Scheduled: {stats.nextRun}</Text>
              </View>
            </View>
          </View>
          
          <Pressable 
            onPress={() => router.push('/admin/payroll/generate')}
            className="bg-white px-8 py-4 rounded-xl shadow-lg flex-row items-center z-10 hover:bg-gray-50 transition-colors"
          >
            <Ionicons name="play-circle" size={24} color="#15803D" />
            <Text className="text-green-700 font-bold text-lg ml-2">Run Payroll Batch</Text>
          </Pressable>
        </View>

        <View style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
            <View>
              <Text className="text-xl font-bold text-brand-text">Worker Balances</Text>
              <View className="flex-row items-center mt-1">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                <Text className="text-[11px] text-gray-500">Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none bg-transparent"
                placeholder="Search worker by name or NIC..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
          
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Worker Info</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Rate (Rs/Day)</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase text-center">Unpaid Days/OT</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-right">Pending Payout</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">History</Text>
            </View>
          )}

          {loading ? (
             <View className="py-20 items-center justify-center">
               <ActivityIndicator color="#10B981" />
             </View>
          ) : filteredWorkers.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium">No workers pending payroll.</Text>
            </View>
          ) : (
            filteredWorkers.map(w => (
              isMobile ? (
                <View key={w.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 16 }}>{w.name}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>{w.skill_type || 'General'} • {w.contact_no}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#16A34A', fontWeight: 'bold', fontSize: 18 }}>
                        {formatMoney(w.pendingAmount)}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11 }}>Pending Payout</Text>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Rate</Text>
                      <Text style={{ color: '#374151', fontWeight: '600' }}>{formatMoney(w.daily_rate || 0)} / Day</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Unpaid</Text>
                      <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#DBEAFE', flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: 'bold' }}>{w.totalDays}D</Text>
                        <Text style={{ color: '#93C5FD', marginHorizontal: 4 }}>|</Text>
                        <Text style={{ color: '#4338CA', fontSize: 12, fontWeight: 'bold' }}>{w.totalOvertime}H</Text>
                      </View>
                    </View>
                  </View>
                  
                  <Pressable 
                    onPress={() => router.push(`/admin/payroll/${w.id}`)} 
                    style={{ backgroundColor: '#F3F4F6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#4B5563', fontSize: 14, fontWeight: 'bold' }}>View Details</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={w.id} className="flex-row items-center py-4 border-b border-gray-50">
                  <View className="w-[30%] pr-2">
                    <Text className="text-brand-text font-bold text-sm truncate">{w.name}</Text>
                    <Text className="text-gray-400 text-xs truncate">{w.skill_type || 'General'} • {w.contact_no}</Text>
                  </View>
                  
                  <View className="w-[20%] pr-2">
                    <Text className="text-gray-700 font-semibold text-sm">{formatMoney(w.daily_rate || 0)}</Text>
                  </View>
                  
                  <View className="w-[20%] flex-row justify-center">
                    <View className="bg-blue-50 px-3 py-1 rounded border border-blue-100 flex-row items-center">
                      <Text className="text-blue-700 text-xs font-bold">{w.totalDays}D</Text>
                      <Text className="text-blue-300 mx-1">|</Text>
                      <Text className="text-indigo-700 text-xs font-bold">{w.totalOvertime}H</Text>
                    </View>
                  </View>
                  
                  <View className="w-[15%]">
                    <Text className="text-green-600 font-bold text-right text-base">
                      {formatMoney(w.pendingAmount)}
                    </Text>
                  </View>
                  
                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable 
                      onPress={() => router.push(`/admin/payroll/${w.id}`)} 
                      className="bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 border border-gray-200"
                    >
                      <Text className="text-gray-600 text-xs font-bold">Details</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}
