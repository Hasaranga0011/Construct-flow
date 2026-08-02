import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

const Bar = ({ label, percentage, count }: { label: string, percentage: number, count: number }) => (
  <View className="items-center justify-end flex-1 mx-2 h-full">
    {/* Label at top */}
    <Text className="text-brand-text font-semibold text-xs mb-1">{count}</Text>
    
    {/* The Bar */}
    <View 
      className="w-full bg-brand-orange rounded-t-sm" 
      style={{ height: `${percentage}%`, minHeight: '5%' }} 
    />
    
    {/* X-axis Label */}
    <Text className="text-gray-500 text-[10px] text-center mt-2 h-8 leading-tight">
      {label}
    </Text>
  </View>
);

export const LabourDistributionChart = ({ refreshTrigger = 0, pmId }: { refreshTrigger?: number, pmId?: string }) => {
  const [data, setData] = useState<{label: string, count: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch all active projects
        let query = supabase.from('projects').select('id, name').eq('status', 'Active');
        if (pmId) {
          query = query.eq('pm_id', pmId);
        }
        const { data: projects } = await query;
        
        // Fetch all attendance for today
        const today = new Date().toISOString().split('T')[0];
        const { data: todayLabour } = await supabase.from('labour').select('project_id, worker_name').eq('date', today);
        
        if (projects && todayLabour) {
          const counts = projects.map(p => {
            const count = todayLabour.filter(l => l.project_id === p.id).length;
            return { label: p.name, count };
          });
          
          if (isMounted) setData(counts);
        }
      } catch (error) {
        console.warn('Failed to load chart data:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadData();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const maxCount = Math.max(...data.map(d => d.count), 1); // Avoid division by zero

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1">
      <View className="mb-4">
        <Text className="text-lg font-bold text-brand-text">Labour Distribution</Text>
        <Text className="text-brand-text-muted text-xs">Total assigned workers per project site</Text>
      </View>

      <View className="flex-1 flex-row items-end justify-around pt-4 pb-2 border-b border-gray-100">
        {loading ? (
          <ActivityIndicator color="#F97316" className="self-center flex-1" />
        ) : data.length === 0 ? (
          <Text className="text-gray-400 self-center flex-1 text-center">No projects.</Text>
        ) : (
          data.slice(0, 4).map((d, i) => (
            <Bar key={i} label={d.label} count={d.count} percentage={(d.count / maxCount) * 90} />
          ))
        )}
      </View>
    </View>
  );
};
