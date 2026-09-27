import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Ionicons } from '@expo/vector-icons';

const STATUS_COLORS: Record<string, string> = {
  'Suggested': '#8B5CF6', // purple
  'Pending Delivery': '#F59E0B', // orange
  'Pending': '#F59E0B',
  'Confirmed': '#3B82F6', // blue
  'Delivered': '#6366F1', // indigo
  'Received': '#10B981', // green
  'Rejected': '#EF4444', // red
  'Cancelled': '#9CA3AF' // gray
};

const STATUS_ORDER = ['Suggested', 'Pending', 'Pending Delivery', 'Confirmed', 'Delivered', 'Received', 'Rejected', 'Cancelled'];

export const PurchaseOrderPipelineChart = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const { data: poData, error } = await supabase
        .from('purchase_orders')
        .select('status');

      if (error) throw error;
      
      const counts: Record<string, number> = {};
      (poData || []).forEach(po => {
        const s = po.status || 'Unknown';
        counts[s] = (counts[s] || 0) + 1;
      });

      const formatted = Object.keys(counts).map(status => ({
        status,
        count: counts[status],
        fill: STATUS_COLORS[status] || '#CBD5E1'
      })).sort((a, b) => {
        const idxA = STATUS_ORDER.indexOf(a.status);
        const idxB = STATUS_ORDER.indexOf(b.status);
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
      });

      setData(formatted);
    } catch (err) {
      console.warn('PurchaseOrderPipelineChart failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('popc-pos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, loadData)
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

  if (data.length === 0) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <Ionicons name="bar-chart-outline" size={48} color="#D1D5DB" />
        <Text className="text-gray-400 mt-2">No purchase orders found.</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <Text className="text-lg font-bold text-brand-text mb-1">Purchase Order Pipeline</Text>
      <Text className="text-gray-500 text-xs mb-6">Distribution of POs by status across all projects</Text>

      <View className="flex-1 min-h-[200px]">
        {/* @ts-ignore */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} angle={-45} textAnchor="end" dy={10} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip 
              cursor={{ fill: '#f9fafb' }} 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(val: number) => [`${val} Orders`, 'Count']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </View>
    </View>
  );
};
