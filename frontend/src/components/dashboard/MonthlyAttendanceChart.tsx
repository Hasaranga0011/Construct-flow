import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { NativeDataChart } from '../common/NativeDataChart';
import { Ionicons } from '@expo/vector-icons';

export const MonthlyAttendanceChart = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select('date')
        .gte('date', dateStr);

      if (error) throw error;
      
      // Group by date
      const counts: Record<string, number> = {};
      
      // Initialize last 30 days with 0 to ensure continuous line
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        counts[dStr] = 0;
      }

      (attendanceData || []).forEach(record => {
        const d = record.date;
        if (counts[d] !== undefined) {
          counts[d]++;
        }
      });

      const formatted = Object.keys(counts).sort().map(date => {
        // format date as 'MMM DD'
        const dObj = new Date(date);
        const label = `${dObj.toLocaleString('default', { month: 'short' })} ${dObj.getDate()}`;
        return {
          date,
          label,
          workers: counts[date]
        };
      });

      setData(formatted);
    } catch (err) {
      console.warn('MonthlyAttendanceChart failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('mac-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <ActivityIndicator color="#F97316" size="large" />
      </View>
    );
  }

  if (data.length === 0 || data.every(d => d.workers === 0)) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <Ionicons name="people-outline" size={48} color="#D1D5DB" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2">No attendance data for the last 30 days.</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Monthly Attendance Trend</Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mb-6">Daily checked-in workers over the last 30 days</Text>

      <View className="flex-1 min-h-[200px]">
        {/* @ts-ignore */}
        <NativeDataChart data={data} labelKey="label" series={[{ key: 'workers', label: 'Workers present', color: '#F97316' }]} />
      </View>
    </View>
  );
};
