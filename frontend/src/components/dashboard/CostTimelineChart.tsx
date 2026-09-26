import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Returns the last N month labels and their numeric month index (0-based) */
function getLastNMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { label: MONTHS[d.getMonth()], monthIdx: d.getMonth(), year: d.getFullYear() };
  });
}

export const CostTimelineChart = () => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxVal, setMaxVal] = useState(1); // in millions
  const [showForecast, setShowForecast] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) { setLoading(false); return; }

      const periods = getLastNMonths(7);

      // 1. Fetch all active projects (budget)
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, total_budget, created_at')
        .eq('status', 'active');

      if (pErr) throw pErr;

      // 2. Fetch delivered purchase orders (actual spend) for those projects
      const projectIds = (projects || []).map((p: any) => p.id);

      let orders: any[] = [];
      if (projectIds.length > 0) {
        const { data: ord, error: oErr } = await supabase
          .from('purchase_orders')
          .select('project_id, total_amount, created_at')
          .in('project_id', projectIds)
          .eq('status', 'Delivered')
          .order('created_at', { ascending: true });
        if (!oErr && ord) orders = ord;
      }

      // 3. Aggregate into monthly buckets
      const aggregated = periods.map(({ label, monthIdx, year }) => {
        // Actual spend: sum delivered PO amounts in this month/year
        const actualSpend = orders
          .filter((o: any) => {
            const d = new Date(o.created_at);
            return d.getMonth() === monthIdx && d.getFullYear() === year;
          })
          .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0) / 1_000_000;

        // Budget: sum project total_budget whose created_at falls in this month/year
        const budgetAlloc = (projects || [])
          .filter((p: any) => {
            const d = new Date(p.created_at);
            return d.getMonth() === monthIdx && d.getFullYear() === year;
          })
          .reduce((sum: number, p: any) => sum + (Number(p.total_budget) || 0), 0) / 1_000_000;

        return { month: label, actual: actualSpend, forecast: budgetAlloc };
      });

      // 4. If no per-month budget data, distribute total budget evenly as forecast
      const totalBudget = (projects || [])
        .reduce((s: number, p: any) => s + (Number(p.total_budget) || 0), 0) / 1_000_000;

      const hasForecast = aggregated.some(a => a.forecast > 0);
      if (!hasForecast && totalBudget > 0) {
        const perMonth = totalBudget / 7;
        aggregated.forEach(a => { a.forecast = perMonth; });
      }

      // 5. Determine chart scale
      const maxFound = Math.max(
        1,
        ...aggregated.map(a => Math.max(a.actual, a.forecast))
      );
      const roundedMax = Math.ceil(maxFound / 10) * 10 || 10;

      setChartData(aggregated);
      setMaxVal(roundedMax);
    } catch (err) {
      console.warn('CostTimelineChart: failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: re-draw when invoices or projects change
  useEffect(() => {
    const trigger = () => loadData();

    const ordersChannel = supabase
      .channel('chart-purchase-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, trigger)
      .subscribe();

    const projectsChannel = supabase
      .channel('chart-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, trigger)
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(projectsChannel);
    };
  }, [loadData]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <View className="flex-row justify-between items-start mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Project Cost vs Timeline (in Millions)</Text>
          <Text className="text-brand-text-muted text-xs">Budget consumption across active projects</Text>
        </View>
        <Pressable 
          className={`flex-row items-center border ${showForecast ? 'border-brand-orange bg-orange-50' : 'border-gray-300 bg-white'} px-3 py-1.5 rounded-full`}
          onPress={() => setShowForecast(!showForecast)}
        >
          <View className={`w-3 h-3 rounded-full mr-1.5 ${showForecast ? 'bg-brand-orange' : 'bg-gray-300'}`} />
          <Text className={`${showForecast ? 'text-brand-orange' : 'text-gray-500'} text-xs font-semibold`}>Budget Plan</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F97316" />
        </View>
      ) : (
        <>
          {/* Chart Area */}
          <View className="flex-1 mt-4">
            {/* Y-axis labels */}
            <View className="absolute left-0 top-0 bottom-6 justify-between items-end pr-2 w-10">
              <Text className="text-gray-400 text-[10px]">{maxVal}M</Text>
              <Text className="text-gray-400 text-[10px]">{(maxVal * 0.75).toFixed(0)}M</Text>
              <Text className="text-gray-400 text-[10px]">{(maxVal * 0.5).toFixed(0)}M</Text>
              <Text className="text-gray-400 text-[10px]">{(maxVal * 0.25).toFixed(0)}M</Text>
              <Text className="text-gray-400 text-[10px]">0</Text>
            </View>
            
            {/* Grid lines */}
            <View className="ml-10 flex-1 justify-between pb-6">
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-300 w-full" />
            </View>

            {/* Bars Container */}
            <View className="absolute left-10 right-0 top-0 bottom-6 flex-row justify-around items-end pt-2">
              {chartData.map((item, index) => (
                <View key={index} className="flex-row items-end h-full gap-[2px]">
                  {/* Actual spend bar */}
                  {item.actual > 0 ? (
                    <View 
                      className="w-4 bg-brand-dark rounded-t-sm" 
                      style={{ height: `${Math.min(100, (item.actual / maxVal) * 100)}%` }}
                    />
                  ) : (
                    <View className="w-4" />
                  )}
                  {/* Budget / forecast bar */}
                  {showForecast && item.forecast > 0 && (
                    <View 
                      className="w-4 bg-brand-orange rounded-t-sm opacity-70" 
                      style={{ height: `${Math.min(100, (item.forecast / maxVal) * 100)}%` }}
                    />
                  )}
                </View>
              ))}
            </View>

            {/* X-axis labels */}
            <View className="ml-10 flex-row justify-around mt-2">
              {chartData.map((item, index) => (
                <Text key={index} className="text-gray-400 text-[10px] w-8 text-center">
                  {item.month}
                </Text>
              ))}
            </View>
          </View>
          
          {/* Legend */}
          <View className="flex-row justify-center mt-4 gap-6">
            <View className="flex-row items-center">
              <View className="w-3 h-3 bg-brand-dark rounded-sm mr-2" />
              <Text className="text-xs text-gray-500">Actual Spend (Invoices)</Text>
            </View>
            <View className="flex-row items-center">
              <View className="w-3 h-3 bg-brand-orange opacity-70 rounded-sm mr-2" />
              <Text className="text-xs text-gray-500">Planned Budget</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
};

