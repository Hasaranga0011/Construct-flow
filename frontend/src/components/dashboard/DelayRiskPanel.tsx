import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

const RiskRow = ({ project, percentage, message, colorClass }: { project: string, percentage: number, message: string, colorClass: string }) => {
  return (
    <View className="mb-4">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-brand-text font-semibold text-sm">{project}</Text>
        <Text className={`font-bold ${colorClass}`}>{percentage}%</Text>
      </View>
      
      {/* Progress Bar Background */}
      <View className="w-full h-2 bg-gray-100 rounded-full mb-1">
        {/* Progress Bar Fill */}
        <View 
          className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`} 
          style={{ width: `${percentage}%` }} 
        />
      </View>
      
      <Text className="text-gray-500 text-xs">{message}</Text>
    </View>
  );
};

export const DelayRiskPanel = ({ pmId }: { pmId?: string }) => {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadRisks = async () => {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';
        const res = await fetch(`${apiUrl}/ai/insights`);
        if (!res.ok) throw new Error('insights endpoint unavailable');
        const data = await res.json();

        // Use real per-project delay risks from the backend
        if (isMounted && data.projects && data.projects.length > 0) {
          // Sort by highest risk first, take top 3
          const sorted = [...data.projects].sort((a: any, b: any) => b.delay_risk - a.delay_risk);
          setRisks(sorted.slice(0, 3));
        }
      } catch (error) {
        console.warn('Delay risk insights unavailable — backend may be offline:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadRisks();
    
    return () => { isMounted = false; };
  }, []);

  const getRiskColor = (score: number) => {
    if (score > 70) return 'text-brand-danger';
    if (score > 40) return 'text-brand-warning';
    return 'text-brand-success';
  };

  const getRiskMessage = (score: number) => {
    if (score > 70) return 'Material delivery delays detected';
    if (score > 40) return 'On track, minor labour gaps';
    return 'Ahead of schedule';
  };

  // If we have no data, fallback to rendering an empty state
  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 min-h-[300px] flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-lg font-bold text-brand-text">AI Delay Risk</Text>
        <View className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
          <Text className="text-brand-danger text-xs font-bold">!</Text>
        </View>
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : risks.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-gray-400">No active risk assessments.</Text>
          </View>
        ) : (
          risks.slice(0, 3).map((risk, idx) => {
            const riskPercentage = risk.delay_risk || 0;
            
            return (
              <RiskRow 
                key={idx}
                project={risk.project_name || risk.name || 'Unknown Project'} 
                percentage={riskPercentage} 
                message={risk.recommendation || getRiskMessage(riskPercentage)} 
                colorClass={getRiskColor(riskPercentage)} 
              />
            );
          })
        )}
      </View>
    </View>
  );
};
