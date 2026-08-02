import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export const CostBreakdown = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [latestEstimate, setLatestEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchLatest = async () => {
      try {
        const { data, error } = await supabase
          .from('estimations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (error) throw error;
        if (isMounted) setLatestEstimate(data?.[0] || null);
      } catch (err) {
        console.warn('Failed to load latest estimate', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchLatest();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  const cost = latestEstimate?.estimated_cost || 0;
  const confidence = latestEstimate?.confidence_score || 0;

  if (loading) {
    return (
      <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 items-center justify-center min-h-[300px]">
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

  if (!latestEstimate) {
    return (
      <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 items-center justify-center min-h-[300px]">
        <Text className="text-gray-400">No estimates generated yet.</Text>
      </View>
    );
  }
  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-lg font-bold text-brand-text">Estimated Cost Breakdown</Text>
        <Pressable className="flex-row items-center border border-gray-200 px-3 py-1.5 rounded-full">
          <Ionicons name="time-outline" size={14} color="#6B7280" className="mr-1.5" />
          <Text className="text-gray-600 text-xs font-semibold">Live Estimate</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center mb-8">
        {/* Mock Donut Chart (Simulated with a colored block grid for now) */}
        <View className="w-32 h-32 rounded-full border-[16px] border-gray-100 items-center justify-center relative overflow-hidden">
           {/* Simulate segments using absolute borders/blocks, or just a segmented bar.
               For this mock, we'll just style a unified circle since CSS pie charts in RN are tricky without SVG.
           */}
           <View className="absolute top-0 right-0 w-16 h-16 bg-gray-400" />
           <View className="absolute bottom-0 right-0 w-16 h-16 bg-brand-dark" />
           <View className="absolute bottom-0 left-0 w-16 h-16 bg-brand-danger" />
           <View className="absolute top-0 left-0 w-16 h-16 bg-black" />
           
           {/* Inner circle to make it a donut */}
           <View className="absolute w-24 h-24 bg-white rounded-full items-center justify-center">
             <Text className="text-[10px] text-gray-500 font-bold text-center leading-tight">Total{'\n'}100%</Text>
           </View>
        </View>

        {/* Right side stats */}
        <View className="ml-8 flex-1">
          <Text className="text-gray-500 text-xs font-semibold mb-1">Total Estimated Cost</Text>
          <Text className="text-4xl font-bold text-brand-orange mb-4">{formatCurrency(cost)}</Text>
          
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-gray-500 text-[10px] uppercase">Estimated Timeline</Text>
              <Text className="text-brand-text font-bold text-sm">28 weeks</Text>
            </View>
            <View>
              <Text className="text-gray-500 text-[10px] uppercase text-right mb-0.5">Confidence Score</Text>
              <View className="bg-[#DCFCE7] px-2 py-0.5 rounded-full self-end">
                <Text className="text-brand-success text-[10px] font-bold">{confidence}%</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Legend */}
      <View className="flex-row flex-wrap justify-between pt-4 border-t border-gray-100">
        <View className="flex-row items-center w-[48%] mb-2">
          <View className="w-3 h-3 rounded-sm bg-gray-400 mr-2" />
          <Text className="text-xs text-gray-600 flex-1">Materials</Text>
          <Text className="text-xs font-bold text-brand-text">42%</Text>
        </View>
        <View className="flex-row items-center w-[48%] mb-2">
          <View className="w-3 h-3 rounded-sm bg-brand-dark mr-2" />
          <Text className="text-xs text-gray-600 flex-1">Labour</Text>
          <Text className="text-xs font-bold text-brand-text">26%</Text>
        </View>
        <View className="flex-row items-center w-[48%]">
          <View className="w-3 h-3 rounded-sm bg-brand-danger mr-2" />
          <Text className="text-xs text-gray-600 flex-1">Equipment</Text>
          <Text className="text-xs font-bold text-brand-text">16%</Text>
        </View>
        <View className="flex-row items-center w-[48%]">
          <View className="w-3 h-3 rounded-sm bg-black mr-2" />
          <Text className="text-xs text-gray-600 flex-1">Overhead</Text>
          <Text className="text-xs font-bold text-brand-text">16%</Text>
        </View>
      </View>

    </View>
  );
};
