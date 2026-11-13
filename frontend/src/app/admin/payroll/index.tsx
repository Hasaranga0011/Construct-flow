import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';
import { useTableRealtime } from '../../../hooks/useTableRealtime';
import { SearchInput } from '@/components/common/SearchInput';
import { Toolbar, ToolbarSearch } from '@/components/ui';
import { AutoFitText } from '@/components/common/AutoFitText';

export default function AdminPayrollIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tick, lastUpdated } = useTableRealtime(['attendance', 'profiles', 'salary_slips', 'workers']);

  const [stats, setStats] = useState({ totalPending: 0, lastRun: 'Never', nextRun: 'End of Month' });

  useEffect(() => {
    let isMounted = true;
    const fetchPayrollOverview = async () => {
      try {
        // Fetch all workers
        const { data: workerData, error: workerErr } = await supabase
          .from('profiles')
          .select('id, full_name, daily_rate, contact_number, worker_type')
          .eq('role', 'worker');

        if (workerErr) throw workerErr;

        // Fetch worker table mappings (worker_id -> user_id)
        const { data: workersList } = await supabase
          .from('workers')
          .select('id, user_id');

        const workerToUser: Record<string, string> = {};
        (workersList || []).forEach(w => {
          if (w.id && w.user_id) workerToUser[w.id] = w.user_id;
        });

        // Fetch all attendance logs
        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('id, worker_id, date, check_in_time, check_out_time, hours_worked, overtime_hours');

        if (attErr) throw attErr;

        // Fetch salary slips to identify already generated periods and last run
        const { data: slipsData } = await supabase
          .from('salary_slips')
          .select('id, worker_id, total_days, overtime_hours, total_amount, period_start, period_end, status, created_at')
          .order('created_at', { ascending: false });

        if (isMounted) {
          let totalPending = 0;

          const enrichedWorkers = (workerData || []).map(w => {
            const workerId = w.id;
            const linkedWorkerRecordIds = (workersList || [])
              .filter(wl => wl.user_id === workerId)
              .map(wl => wl.id);

            const allWorkerIds = new Set([workerId, ...linkedWorkerRecordIds]);

            // All attendance records for this worker
            const records = (attData || []).filter(a =>
              allWorkerIds.has(a.worker_id) || (a.worker_id && workerToUser[a.worker_id] === workerId)
            );

            // Filter valid attendance days
            const validRecords = records.filter(r =>
              Boolean(r.check_in_time || r.check_out_time || (Number(r.hours_worked) > 0) || r.date)
            );

            const uniqueDates = new Set(validRecords.map(r => r.date).filter(Boolean));
            const totalDays = uniqueDates.size;

            let totalOvertime = 0;
            validRecords.forEach(r => {
              let ot = Number(r.overtime_hours);
              if (isNaN(ot) || ot === 0) {
                const hours = Number(r.hours_worked) || 8;
                ot = hours > 8 ? hours - 8 : 0;
              }
              totalOvertime += Math.max(0, ot);
            });

            const workerRate = Number(w.daily_rate) > 0 ? Number(w.daily_rate) : 3500;
            const overtimeRate = (workerRate / 8) * 1.5;
            const pendingAmount = (totalDays * workerRate) + (totalOvertime * overtimeRate);

            totalPending += pendingAmount;

            return {
              ...w,
              name: w.full_name || 'Worker',
              role: 'Worker',
              daily_rate: workerRate,
              totalDays,
              totalOvertime: Math.round(totalOvertime * 10) / 10,
              pendingAmount
            };
          }).sort((a, b) => b.pendingAmount - a.pendingAmount);

          setWorkers(enrichedWorkers);

          const latestSlip = (slipsData && slipsData.length > 0) ? slipsData[0] : null;
          const lastRunText = latestSlip?.created_at
            ? format(new Date(latestSlip.created_at), 'MMM dd, yyyy')
            : 'Never';

          setStats({
            totalPending,
            lastRun: lastRunText,
            nextRun: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'MMM dd, yyyy')
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

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/labour')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Labour</Text>
        </Pressable>

        {/* Header Action Card */}
        <View className="bg-green-700 rounded-2xl p-4 md:p-8 shadow-sm mb-8 flex-col lg:flex-row gap-4 justify-between items-start overflow-hidden relative">
          <View className="absolute right-0 top-0 opacity-10">
            <Ionicons name="cash" size={200} color="#FFFFFF" />
          </View>

          <View className="z-10 flex-shrink min-w-0 w-full lg:w-auto">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-200 text-sm font-bold uppercase tracking-wider mb-2">Estimated Pending Liabilities</Text>
            <AutoFitText value={`Rs. ${stats.totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} maxFontSize={36} minFontSize={22} className="font-extrabold text-white" captionClassName="text-green-100" containerStyle={{ marginBottom: 8 }} />
            <View className="flex-row flex-wrap gap-2 items-center mt-2">
              <View className="bg-green-800/50 px-3 py-1 rounded border border-green-600/50 mr-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-100 text-xs">Last Run: {stats.lastRun}</Text>
              </View>
              <View className="bg-green-800/50 px-3 py-1 rounded border border-green-600/50">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-100 text-xs">Next Scheduled: {stats.nextRun}</Text>
              </View>
            </View>
          </View>

          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => router.push('/admin/payroll/generate')}
            className="bg-white max-w-full px-4 py-4 rounded-xl shadow-lg flex-row items-center z-10 hover:bg-gray-50 transition-colors"
          >
            <Ionicons name="play-circle" size={24} color="#15803D" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-700 font-bold text-lg ml-2">Run Payroll Batch</Text>
          </Pressable>
        </View>

        <View style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
            <View className="mb-4 md:mb-0">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Worker Balances</Text>
              <View className="flex-row items-center mt-1">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}</Text>
              </View>
            </View>
            <Toolbar>
              <ToolbarSearch>
                <SearchInput entityLabel="workers" items={workers}
                  placeholder="Search worker by name..."
                  value={search}
                  onChangeText={setSearch}
                  className={isMobile ? "w-full" : "w-80"}
                  config={{
                    table: 'profiles',
                    searchColumn: 'full_name',
                    titleColumn: 'full_name'
                  }}
                />
              </ToolbarSearch>
            </Toolbar>
          </View>

          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Worker Info</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Rate (Rs/Day)</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase text-center">Unpaid Days/OT</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-right">Pending Payout</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">History</Text>
            </View>
          )}

          {loading ? (
             <View className="py-20 items-center justify-center">
               <ActivityIndicator color="#10B981" />
             </View>
          ) : filteredWorkers.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No workers pending payroll.</Text>
            </View>
          ) : (
            filteredWorkers.map(w => (
              isMobile ? (
                <View key={w.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16 }]}>{w.name}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>{w.worker_type || 'General'}{w.contact_number ? ` • ${w.contact_number}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#16A34A', fontWeight: 'bold', fontSize: 18 }]}>
                        {formatMoney(w.pendingAmount)}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 11 }]}>Pending Payout</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Rate</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#374151', fontWeight: '600' }]}>{formatMoney(w.daily_rate || 0)} / Day</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Unpaid</Text>
                      <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#DBEAFE', flexDirection: 'row', alignItems: 'center' }}>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#1D4ED8', fontSize: 12, fontWeight: 'bold' }]}>{w.totalDays}D</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#93C5FD', marginHorizontal: 4 }]}>|</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#4338CA', fontSize: 12, fontWeight: 'bold' }]}>{w.totalOvertime}H</Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => router.push(`/admin/payroll/${w.id}`)}
                    style={[{ backgroundColor: '#F3F4F6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#4B5563', fontSize: 14, fontWeight: 'bold' }]}>View Details</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={w.id} className="flex-row items-center py-4 border-b border-gray-50">
                  <View className="w-[30%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{w.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs truncate">{w.worker_type || 'General'}{w.contact_number ? ` • ${w.contact_number}` : ''}</Text>
                  </View>

                  <View className="w-[20%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold text-sm">{formatMoney(w.daily_rate || 0)}</Text>
                  </View>

                  <View className="w-[20%] flex-row justify-center">
                    <View className="bg-blue-50 px-3 py-1 rounded border border-blue-100 flex-row items-center">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 text-xs font-bold">{w.totalDays}D</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-300 mx-1">|</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-indigo-700 text-xs font-bold">{w.totalOvertime}H</Text>
                    </View>
                  </View>

                  <View className="w-[15%]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-600 font-bold text-right text-base">
                      {formatMoney(w.pendingAmount)}
                    </Text>
                  </View>

                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => router.push(`/admin/payroll/${w.id}`)}
                      className="bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 border border-gray-200"
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-bold">Details</Text>
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
