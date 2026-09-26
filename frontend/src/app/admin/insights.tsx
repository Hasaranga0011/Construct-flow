import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { TopNav } from '@/components/common/TopNav';
import { useResponsive } from '../../hooks/useResponsive';

export default function MLInsightsDashboard() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const data = await api.get('/ai/insights');
        setInsights(data);
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="mt-4 text-brand-text dark:text-white font-semibold">Loading ML Insights...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center p-8">
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text className="mt-4 text-brand-text dark:text-white font-bold text-lg text-center">Failed to load insights</Text>
        <Text className="mt-2 text-gray-500 dark:text-gray-400 text-center">{errorMsg}</Text>
        <Text className="mt-4 text-gray-400 dark:text-gray-500 text-xs text-center">Ensure the Python FastAPI backend is running.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <TopNav title="AI Analytics & Insights" showAction={false} />
      <ScrollView showsVerticalScrollIndicator={false} className={isMobile ? "p-4" : "p-8"}>
        <View className="mb-8">
          <Text className="text-3xl font-bold text-brand-text dark:text-white mb-2">ML Insights</Text>
          <Text className="text-gray-500 dark:text-gray-400">Project statistics and prototype model information. Model accuracy has not been validated.</Text>
        </View>

        {/* Model Performance Overview */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 24 }}>
          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-blue-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="server-outline" size={24} color="#3B82F6" />
            </View>
            <View>
              <Text className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Active Model</Text>
              <Text className="text-brand-text dark:text-white font-bold text-base mt-1">{insights?.active_model}</Text>
            </View>
          </View>
          
          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-green-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="analytics-outline" size={24} color="#10B981" />
            </View>
            <View>
              <Text className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Accuracy Score</Text>
              <Text className="text-brand-text dark:text-white font-bold text-base mt-1">{insights?.accuracy_score}</Text>
            </View>
          </View>

          <View className="flex-1 bg-white dark:bg-[#1E293B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-purple-50 dark:bg-gray-800 items-center justify-center mr-4">
              <Ionicons name="documents-outline" size={24} color="#8B5CF6" />
            </View>
            <View>
              <Text className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Training Samples</Text>
              <Text className="text-brand-text dark:text-white font-bold text-base mt-1">{insights?.total_training_samples.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
          {/* Feature importance data from the insights endpoint */}
          <View style={{ flex: isMobile ? undefined : 3, width: isMobile ? '100%' : undefined, backgroundColor: '#fff', borderRadius: 16, padding: isMobile ? 16 : 28, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <Text className="text-lg font-bold text-brand-text dark:text-white mb-6">Cost Driver Analysis (Feature Importance)</Text>
            
            <View className="gap-5">
              {insights?.feature_importance?.length > 0 ? insights.feature_importance.map((feature: any, index: number) => (
                <View key={index}>
                  <View className="flex-row justify-between mb-2">
                    <Text className="font-semibold text-gray-700 dark:text-gray-300">{feature.name}</Text>
                    <Text className="font-bold text-brand-orange">{feature.value}%</Text>
                  </View>
                  <View className="w-full bg-gray-100 dark:bg-gray-800 h-3 rounded-full overflow-hidden">
                    <View 
                      className="bg-brand-orange h-full rounded-full" 
                      style={{ width: `${feature.value}%` }} 
                    />
                  </View>
                </View>
              )) : <Text className="text-gray-400 dark:text-gray-500 italic">No feature importance data available. Model may not be trained.</Text>}
            </View>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-6 italic">
              *The ML model identified these features as the primary drivers of construction costs.
            </Text>
          </View>

          {/* New Panel: Real-time Stats from Supabase via AI Endpoint */}
          <View style={{ flex: isMobile ? undefined : 2, width: isMobile ? '100%' : undefined, gap: 16 }}>
            <View className="bg-white dark:bg-[#1E293B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <Text className="text-lg font-bold text-brand-text dark:text-white mb-6">Project Health Overview</Text>
              
              <View className="gap-4">
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-semibold">Total Projects</Text>
                  <Text className="font-bold text-brand-text dark:text-white text-lg">{insights?.project_health?.total || 0}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-semibold">Active In-Progress</Text>
                  <Text className="font-bold text-blue-500 text-lg">{insights?.project_health?.active || 0}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-semibold">Completed</Text>
                  <Text className="font-bold text-green-500 text-lg">{insights?.project_health?.completed || 0}</Text>
                </View>
                
                <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mb-2">Budget Compliance</Text>
                  <View className="flex-row items-end">
                    <Text className="text-3xl font-black text-brand-text dark:text-white leading-none">{insights?.project_health?.on_budget_percent || 0}%</Text>
                    <Text className="text-sm text-gray-400 font-semibold ml-2 mb-1">On Budget</Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="bg-white dark:bg-[#1E293B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <Text className="text-lg font-bold text-brand-text dark:text-white mb-6">Labour & Resources</Text>
              <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-gray-500 dark:text-gray-400 font-semibold">Total Workers</Text>
                  <Text className="font-bold text-brand-text dark:text-white text-lg">{insights?.labour_stats?.total_workers || 0}</Text>
              </View>
              <View className="flex-row justify-between items-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-semibold">Productivity Score</Text>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="trending-up" size={16} color="#10B981" />
                    <Text className="font-bold text-green-500 text-lg">{insights?.labour_stats?.productivity_score == null ? 'Unavailable' : `${insights.labour_stats.productivity_score}%`}</Text>
                  </View>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-white dark:bg-[#1E293B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8">
            <Text className="text-lg font-bold text-brand-text dark:text-white mb-6">Market Trends (Avg Cost / SqFt)</Text>
            
            <View className="flex-row flex-wrap gap-4">
              {!insights?.market_trends?.length && <Text className="text-gray-500">Verified market price data is not available.</Text>}
              {insights?.market_trends?.map((trend: any, index: number) => {
                const prevCost = index > 0 ? insights.market_trends[index-1].avg_cost_sqft : trend.avg_cost_sqft;
                const percentChange = ((trend.avg_cost_sqft - prevCost) / prevCost * 100).toFixed(1);
                const isUp = Number(percentChange) > 0;
                
                return (
                  <View key={index} className="flex-1 min-w-[120px] p-4 rounded-xl bg-gray-50 dark:bg-[#0F172A] border border-gray-100 dark:border-gray-800">
                    <Text className="font-bold text-gray-500 dark:text-gray-400 mb-1">{trend.month}</Text>
                    <Text className="font-black text-brand-text dark:text-white text-lg mb-2">Rs. {trend.avg_cost_sqft.toLocaleString()}</Text>
                    {index > 0 ? (
                      <View className={`flex-row items-center self-start px-2 py-1 rounded-lg ${isUp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                        <Ionicons name={isUp ? "trending-up" : "trending-down"} size={12} color={isUp ? "#EF4444" : "#10B981"} />
                        <Text className={`text-xs font-bold ml-1 ${isUp ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {Math.abs(Number(percentChange))}%
                        </Text>
                      </View>
                    ) : (
                      <View className="px-2 py-1"><Text className="text-gray-400 dark:text-gray-600 text-xs">—</Text></View>
                    )}
                  </View>
                );
              })}
            </View>
        </View>

      </ScrollView>
    </View>
  );
}
