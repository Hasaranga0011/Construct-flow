import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { formatHoursMinutes } from '@/utils/format';

interface ChartItem {
  label: string;
  regular: number;
  overtime: number;
}

export function WorkerAttendanceChart({ chartData }: { chartData: ChartItem[] }) {
  const maxHours = Math.max(12, ...chartData.map((d) => (d.regular || 0) + (d.overtime || 0)));

  return (
    <View className="flex-1 mt-4 justify-end">
      <Text className="text-xs text-slate-500 mb-3">Swipe horizontally to see every day of the month →</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'flex-end', gap: 12, paddingHorizontal: 4 }}>
        {chartData.map((item, idx) => {
          const total = (item.regular || 0) + (item.overtime || 0);
          const regHeight = Math.min(180, (item.regular / maxHours) * 180);
          const otHeight = (item.overtime / maxHours) * 180;

          return (
            <View key={idx} className="items-center" style={{ width: 42 }}>
              <Text className="text-[10px] font-semibold text-slate-500 mb-1">
                {total > 0 ? formatHoursMinutes(total) : ''}
              </Text>
              <View className="w-6 rounded-t overflow-hidden bg-slate-100 items-center justify-end" style={{ height: 180 }}>
                {item.overtime > 0 && (
                  <View style={{ height: otHeight }} className="w-full bg-brand-orange" />
                )}
                {item.regular > 0 && (
                  <View style={{ height: regHeight }} className="w-full bg-slate-900" />
                )}
              </View>
              <Text className="text-[11px] font-medium text-slate-500 mt-2 truncate">
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
