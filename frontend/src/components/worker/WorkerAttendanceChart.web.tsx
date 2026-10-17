import React from 'react';
import { View } from 'react-native';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartItem {
  label: string;
  regular: number;
  overtime: number;
}

export function WorkerAttendanceChart({ chartData }: { chartData: ChartItem[] }) {
  return (
    <View className="flex-1 mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          <Bar dataKey="regular" stackId="a" fill="#1e293b" radius={[0, 0, 4, 4]} name="Regular Hours" />
          <Bar dataKey="overtime" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} name="Overtime" />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}
