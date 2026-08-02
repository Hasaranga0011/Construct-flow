import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

export const CostTimelineChart = () => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxVal, setMaxVal] = useState(80); // Default scale
  const [showForecast, setShowForecast] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadEstimates = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('estimations')
          .select('estimated_cost, status, created_at')
          .order('created_at', { ascending: true });

        if (error) throw error;
        
        // We will build a 7-item array to simulate 7 periods
        // Grouping by month to demonstrate the UI
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
        const aggregated = months.map(m => ({ month: m, actual: 0, forecast: 0 }));

        let maxFound = 80;

        if (data && data.length > 0) {
          data.forEach(est => {
            const date = new Date(est.created_at);
            const monthIdx = date.getMonth(); // 0-11
            const normalizedIdx = monthIdx % 7; // map it roughly to our 7 slots
            const costInMillions = (Number(est.estimated_cost) || 0) / 1000000;

            if (est.status === 'Approved') {
              aggregated[normalizedIdx].actual += costInMillions;
            } else {
              aggregated[normalizedIdx].forecast += costInMillions;
            }

            if (aggregated[normalizedIdx].actual > maxFound) maxFound = Math.ceil(aggregated[normalizedIdx].actual / 10) * 10;
            if (aggregated[normalizedIdx].forecast > maxFound) maxFound = Math.ceil(aggregated[normalizedIdx].forecast / 10) * 10;
          });
        }

        if (isMounted) {
          setChartData(aggregated);
          setMaxVal(maxFound);
        }
      } catch (error) {
        console.warn('Failed to load estimations:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadEstimates();
    
    return () => { isMounted = false; };
  }, []);

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
          <Text className={`${showForecast ? 'text-brand-orange' : 'text-gray-500'} text-xs font-semibold`}>AI Forecast</Text>
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
            <View className="absolute left-0 top-0 bottom-6 justify-between items-end pr-2 w-8">
              <Text className="text-gray-400 text-[10px]">{maxVal}</Text>
              <Text className="text-gray-400 text-[10px]">{Math.round(maxVal * 0.75)}</Text>
              <Text className="text-gray-400 text-[10px]">{Math.round(maxVal * 0.5)}</Text>
              <Text className="text-gray-400 text-[10px]">{Math.round(maxVal * 0.25)}</Text>
              <Text className="text-gray-400 text-[10px]">0</Text>
            </View>
            
            {/* Grid lines */}
            <View className="ml-8 flex-1 justify-between pb-6">
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-100 w-full" />
              <View className="border-b border-gray-300 w-full" />
            </View>

            {/* Bars Container */}
            <View className="absolute left-8 right-0 top-0 bottom-6 flex-row justify-around items-end pt-2">
              {chartData.map((item, index) => (
                <View key={index} className="flex-row items-end h-full">
                  {/* Actual Bar */}
                  {item.actual > 0 && (
                    <View 
                      className="w-3 bg-brand-dark rounded-t-sm mx-[1px]" 
                      style={{ height: `${(item.actual / maxVal) * 100}%` }}
                    />
                  )}
                  {/* Forecast Bar */}
                  {showForecast && item.forecast > 0 && (
                    <View 
                      className="w-3 bg-brand-orange rounded-t-sm mx-[1px] opacity-70" 
                      style={{ height: `${(item.forecast / maxVal) * 100}%` }}
                    />
                  )}
                </View>
              ))}
            </View>

            {/* X-axis labels */}
            <View className="ml-8 flex-row justify-around mt-2">
              {chartData.map((item, index) => (
                <Text key={index} className="text-gray-400 text-[10px] w-6 text-center">
                  {item.month}
                </Text>
              ))}
            </View>
          </View>
          
          {/* Legend */}
          <View className="flex-row justify-center mt-4">
            <View className="flex-row items-center mr-4">
              <View className="w-3 h-3 bg-brand-dark rounded-sm mr-2" />
              <Text className="text-xs text-gray-500">Approved Cost</Text>
            </View>
            <View className="flex-row items-center">
              <View className="w-3 h-3 bg-brand-orange opacity-70 rounded-sm mr-2" />
              <Text className="text-xs text-gray-500">AI Forecast (Pending)</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
};
