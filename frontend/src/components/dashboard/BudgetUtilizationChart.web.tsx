import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../services/api';

export const BudgetUtilizationChart = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadData = async () => {
    try {
      const { data: projData, error } = await supabase
        .from('projects')
        .select('id, name, total_budget')
        .eq('status', 'active');

      if (error) throw error;
      
      const activeProjects = projData || [];
      const financialsList = await Promise.all(
        activeProjects.map(async p => {
          const fin = await api.projects.financials(p.id).catch(() => null);
          return { id: p.id, name: p.name, budget: Number(p.total_budget) || 1, fin };
        })
      );
      
      const formatted = financialsList.map(p => {
        const spent = p.fin ? (p.fin.actual_spend || 0) : 0;
        const percent = Math.round((spent / p.budget) * 100);
        let fill = '#10B981'; // brand-success
        if (percent >= 100) fill = '#EF4444'; // brand-danger
        else if (percent >= 70) fill = '#F59E0B'; // brand-warning
        
        return {
          id: p.id,
          name: p.name,
          percent,
          spentText: `Rs. ${(spent/1_000_000).toFixed(1)}M`,
          fill
        };
      }).sort((a, b) => b.percent - a.percent);

      setData(formatted);
    } catch (err) {
      console.warn('BudgetUtilizationChart failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('buc-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, loadData)
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
        <Ionicons name="pie-chart-outline" size={48} color="#D1D5DB" />
        <Text className="text-gray-400 mt-2">No active projects found.</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <Text className="text-lg font-bold text-brand-text mb-1">Budget Utilization</Text>
      <Text className="text-gray-500 text-xs mb-6">Spent cost % by active project</Text>

      <View className="flex-1 min-h-[250px]">
        {/* @ts-ignore */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} domain={[0, 'dataMax']} unit="%" />
            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} width={90} />
            <Tooltip 
              cursor={{ fill: '#f9fafb' }} 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(val, name, props) => [`${val}% (${props.payload.spentText})`, 'Utilization']}
            />
            <Bar 
              dataKey="percent" 
              radius={[0, 4, 4, 0]} 
              barSize={20}
              onClick={(d) => router.push(`/admin/projects/${d.id}`)}
              style={{ cursor: 'pointer' }}
            >
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
