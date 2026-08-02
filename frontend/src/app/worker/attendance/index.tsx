import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';

export default function WorkerAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ present: 0, absent: 0, total: 0 });

  useEffect(() => {
    let isMounted = true;

    const fetchAttendance = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;
        const userId = sessionData.session.user.id;

        const { data, error } = await supabase
          .from('attendance')
          .select('*, sites(name)')
          .eq('worker_id', userId)
          .order('date', { ascending: false });

        if (error) throw error;

        if (isMounted && data) {
          setRecords(data);
          setStats({
            present: data.filter(r => r.status === 'Present').length,
            absent: data.filter(r => r.status === 'Absent').length,
            total: data.length,
          });
        }
      } catch (error) {
        console.error('Worker attendance error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAttendance();
    return () => { isMounted = false; };
  }, []);

  const getStatusStyle = (status: string) => {
    if (status === 'Present') return { bg: 'bg-green-100', text: 'text-green-700', icon: 'checkmark-circle' as const };
    if (status === 'Absent') return { bg: 'bg-red-100', text: 'text-red-700', icon: 'close-circle' as const };
    return { bg: 'bg-gray-100', text: 'text-gray-500', icon: 'help-circle' as const };
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="My Attendance" showAction={false} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-8" showsVerticalScrollIndicator={false}>

          {/* Summary Cards */}
          <View className="flex-row gap-4 mb-8">
            <View className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 items-center">
              <Text className="text-4xl font-bold text-green-600">{stats.present}</Text>
              <Text className="text-gray-500 text-sm mt-1 font-semibold">Days Present</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 items-center">
              <Text className="text-4xl font-bold text-red-500">{stats.absent}</Text>
              <Text className="text-gray-500 text-sm mt-1 font-semibold">Days Absent</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 items-center">
              <Text className="text-4xl font-bold text-brand-orange">
                {stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%
              </Text>
              <Text className="text-gray-500 text-sm mt-1 font-semibold">Attendance Rate</Text>
            </View>
          </View>

          {/* History Table */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <View className="flex-row py-4 px-6 bg-gray-50 border-b border-gray-100">
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Date</Text>
              <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">Site</Text>
              <Text className="w-28 text-xs font-bold text-gray-500 uppercase text-right">Status</Text>
            </View>

            {records.length === 0 ? (
              <View className="p-10 items-center justify-center">
                <Ionicons name="calendar-outline" size={48} color="#E5E7EB" />
                <Text className="text-gray-400 mt-4">No attendance records found.</Text>
              </View>
            ) : (
              records.map((record, i) => {
                const style = getStatusStyle(record.status);
                return (
                  <View key={record.id} className={`flex-row items-center py-4 px-6 ${i < records.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800">
                        {new Date(record.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        {new Date(record.date).toLocaleDateString('en-GB', { weekday: 'long' })}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-gray-600 text-sm">{record.sites?.name || 'Unknown Site'}</Text>
                    </View>
                    <View className={`flex-row items-center ${style.bg} px-3 py-1.5 rounded-full w-28 justify-center`}>
                      <Ionicons name={style.icon} size={14} color={style.text.includes('green') ? '#16A34A' : style.text.includes('red') ? '#DC2626' : '#6B7280'} />
                      <Text className={`${style.text} font-bold text-xs ml-1`}>{record.status}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
