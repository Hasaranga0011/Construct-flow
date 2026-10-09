import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { NativeDataChart } from '../common/NativeDataChart';
import { Ionicons } from '@expo/vector-icons';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CostTimelineChart = ({ pmId }: { pmId?: string } = {}) => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [showForecast, setShowForecast] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) { setLoading(false); return; }

      // 1. Fetch active projects
      let projectQuery = supabase
        .from('projects')
        .select('id, name, total_budget, start_date, end_date')
        .neq('status', 'Cancelled');
      if (pmId) projectQuery = projectQuery.eq('pm_id', pmId);
      const { data: projData, error: pErr } = await projectQuery;
      if (pErr) throw pErr;

      const pList = projData || [];
      setProjects(pList);

      if (pList.length === 0) {
        setLoading(false);
        return;
      }

      const projectIds = pList.map(p => p.id);

      // 2. Fetch expenses
      const { data: expData } = await supabase
        .from('project_expenses')
        .select('project_id, amount, expense_date')
        .in('project_id', projectIds);

      // 3. Fetch purchase orders
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('project_id, total_price, created_at')
        .in('project_id', projectIds)
        .in('status', ['Delivered', 'Received']);

      setExpenses(expData || []);
      setPurchaseOrders(poData || []);
    } catch (err) {
      console.warn('CostTimelineChart: failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [pmId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const trigger = () => loadData();
    const chan1 = supabase.channel('ctc-po').on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, trigger).subscribe();
    const chan2 = supabase.channel('ctc-proj').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, trigger).subscribe();
    const chan3 = supabase.channel('ctc-exp').on('postgres_changes', { event: '*', schema: 'public', table: 'project_expenses' }, trigger).subscribe();
    return () => { supabase.removeChannel(chan1); supabase.removeChannel(chan2); supabase.removeChannel(chan3); };
  }, [loadData]);

  const chartData = useMemo(() => {
    if (projects.length === 0) return [];

    // Filter projects based on selection
    const activeProjects = selectedProjectId === 'ALL'
      ? projects
      : projects.filter(p => p.id === selectedProjectId);

    if (activeProjects.length === 0) return [];

    // Find min start date and max end date
    let minDate = new Date();
    let maxDate = new Date();
    let isFirst = true;

    activeProjects.forEach(p => {
      const start = p.start_date ? new Date(p.start_date) : new Date();
      const end = p.end_date ? new Date(p.end_date) : new Date();
      if (isFirst) { minDate = start; maxDate = end; isFirst = false; }
      else {
        if (start < minDate) minDate = start;
        if (end > maxDate) maxDate = end;
      }
    });

    // Generate month buckets
    const startYear = minDate.getFullYear();
    const startMonth = minDate.getMonth();
    const endYear = maxDate.getFullYear();
    const endMonth = maxDate.getMonth();

    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    const bucketCount = Math.max(1, monthsDiff);

    const buckets: { label: string; year: number; month: number; actual: number; forecast: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const d = new Date(startYear, startMonth + i, 1);
      buckets.push({
        label: `${MONTHS[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`,
        year: d.getFullYear(),
        month: d.getMonth(),
        actual: 0,
        forecast: 0
      });
    }

    // Allocate forecast (linear spread per project)
    activeProjects.forEach(p => {
      const pStart = p.start_date ? new Date(p.start_date) : new Date();
      const pEnd = p.end_date ? new Date(p.end_date) : new Date();
      const pStartM = pStart.getFullYear() * 12 + pStart.getMonth();
      const pEndM = pEnd.getFullYear() * 12 + pEnd.getMonth();
      const pDuration = Math.max(1, pEndM - pStartM + 1);
      const monthlyAlloc = (Number(p.total_budget) || 0) / pDuration / 1_000_000;

      buckets.forEach(b => {
        const bM = b.year * 12 + b.month;
        if (bM >= pStartM && bM <= pEndM) {
          b.forecast += monthlyAlloc;
        }
      });
    });

    // Allocate actuals
    const relevantExpenses = selectedProjectId === 'ALL' ? expenses : expenses.filter(e => e.project_id === selectedProjectId);
    const relevantPOs = selectedProjectId === 'ALL' ? purchaseOrders : purchaseOrders.filter(po => po.project_id === selectedProjectId);

    relevantExpenses.forEach(e => {
      if (!e.expense_date) return;
      const d = new Date(e.expense_date);
      const b = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
      if (b) b.actual += (Number(e.amount) || 0) / 1_000_000;
    });

    relevantPOs.forEach(po => {
      if (!po.created_at) return;
      const d = new Date(po.created_at);
      const b = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
      if (b) b.actual += (Number(po.total_price) || 0) / 1_000_000;
    });

    return buckets;
  }, [projects, expenses, purchaseOrders, selectedProjectId]);

  if (loading) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <ActivityIndicator color="#F97316" size="large" />
      </View>
    );
  }

  if (projects.length === 0) {
    return (
      <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] items-center justify-center">
        <Ionicons name="bar-chart-outline" size={48} color="#D1D5DB" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2">No active projects data available.</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[400px]">
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-1">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-1">Project Cost vs Timeline</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Values in Millions (LKR)</Text>
        </View>
        <Pressable style={{ minHeight: 44, minWidth: 44 }}
          className={`flex-row items-center border ${showForecast ? 'border-brand-orange bg-orange-50' : 'border-gray-300 bg-white'} px-3 py-1.5 rounded-full ml-4`}
          onPress={() => setShowForecast(!showForecast)}
        >
          <View className={`w-3 h-3 rounded-full mr-1.5 ${showForecast ? 'bg-brand-orange' : 'bg-gray-300'}`} />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`${showForecast ? 'text-brand-orange' : 'text-gray-500'} text-xs font-semibold`}>Budget Plan</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} className="mb-6">
        <View className="flex-row items-center gap-2 pr-4">
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={() => setSelectedProjectId('ALL')}
            className={`px-4 py-1.5 rounded-full border ${selectedProjectId === 'ALL' ? 'bg-brand-dark border-brand-dark' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${selectedProjectId === 'ALL' ? 'text-white' : 'text-gray-600'}`}>All Projects (Combined)</Text>
          </Pressable>
          {projects.map(p => (
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              key={p.id}
              onPress={() => setSelectedProjectId(p.id)}
              className={`px-4 py-1.5 rounded-full border ${selectedProjectId === p.id ? 'bg-brand-dark border-brand-dark' : 'bg-gray-50 border-gray-200'}`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${selectedProjectId === p.id ? 'text-white' : 'text-gray-600'}`}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {chartData.length === 0 ? (
        <View className="flex-1 items-center justify-center min-h-[250px]">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">Timeline calculation failed.</Text>
        </View>
      ) : (
        <View className="flex-1 min-h-[250px]">
          {/* @ts-ignore */}
          <NativeDataChart data={chartData} labelKey="label" series={[...(showForecast ? [{ key: 'forecast', label: 'Planned budget (LKR millions)', color: '#FDBA74' }] : []), { key: 'actual', label: 'Actual spend (LKR millions)', color: '#334155' }]} />
        </View>
      )}
    </View>
  );
};
