import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { HorizontalBarChart, HorizontalBarChartData } from '../common/HorizontalBarChart';
import { useRouter } from 'expo-router';
import { api } from '../../services/api';

export const BudgetUtilizationChart = () => {
  const [data, setData] = useState<HorizontalBarChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadData = async () => {
    try {
      const { data: projData, error } = await supabase
        .from('projects')
        .select('id, name, location, total_budget')
        .eq('status', 'active');

      if (error) throw error;
      
      // Filter out test projects
      const activeProjects = (projData || []).filter(p => !p.name.toLowerCase().includes('test'));

      // Count occurrences of each name to handle duplicates
      const nameCounts = activeProjects.reduce((acc, p) => {
        acc[p.name] = (acc[p.name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const financialsList = await Promise.all(
        activeProjects.map(async p => {
          const fin = await api.projects.financials(p.id).catch(() => null);
          return { ...p, budget: Number(p.total_budget) || 0, fin };
        })
      );
      
      const formatted = financialsList.map(p => {
        const spent = p.fin ? (p.fin.actual_spend || 0) : 0;
        
        // Division by zero guard
        const isBudgetZero = p.budget <= 0;
        const percent = isBudgetZero ? 0 : Math.round((spent / p.budget) * 100);
        
        let fill = '#10B981'; // brand-success
        if (percent >= 100) fill = '#EF4444'; // brand-danger
        else if (percent >= 70) fill = '#F59E0B'; // brand-warning
        
        // Format names to avoid duplicates
        let label = p.name;
        if (nameCounts[p.name] > 1 && p.location) {
          const shortLoc = p.location.split(',')[0];
          label = `${p.name} - ${shortLoc}`;
        }

        const formatCurrency = (val: number) => `Rs. ${(val/1_000_000).toFixed(1)}M`;
        const spentText = formatCurrency(spent);
        const budgetText = isBudgetZero ? 'No budget set' : formatCurrency(p.budget);
        
        return {
          id: p.id,
          label,
          value: percent,
          color: fill,
          tooltipTitle: label,
          tooltipSubtitle: `Spent ${spentText} of ${budgetText}`,
        };
      }).sort((a, b) => b.value - a.value);

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

  // Check if ALL projects have 0% utilization
  const allZero = data.length > 0 && data.every(d => d.value === 0);
  const emptyMessage = allZero 
    ? "No spending recorded yet. Utilization will appear here once expenses, received orders or payroll are logged."
    : "No active projects found.";

  return (
    <HorizontalBarChart
      title="Budget Utilization"
      subtitle="Spent cost % by active project"
      data={allZero ? [] : data}
      emptyMessage={emptyMessage}
      onRowPress={(row) => router.push(`/admin/projects/${row.id}` as any)}
      showReferenceLine={true}
    />
  );
};
