import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { QuotationForm } from '../../components/estimator/QuotationForm';
import { CostBreakdown } from '../../components/estimator/CostBreakdown';
import { RecentEstimates } from '../../components/estimator/RecentEstimates';
import { supabase } from '../../lib/supabase';
import { useResponsive } from '../../hooks/useResponsive';

export default function EstimatorScreen() {
  const { isMobile } = useResponsive();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [stats, setStats] = useState({ total: 0, pending: 0, value: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.from('estimations').select('status, estimated_cost');
        if (error) throw error;
        
        if (data && isMounted) {
          setStats({
            total: data.length,
            pending: data.filter(e => e.status === 'Pending').length,
            value: data.reduce((sum, e) => sum + (Number(e.estimated_cost) || 0), 0)
          });
        }
      } catch (err) {
        console.warn('Failed to load estimator stats', err);
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="AI Estimator" actionLabel="+ New Project" showAction={false} />
      
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        {/* Top Stat Cards Row */}
        <View className="flex-row flex-wrap justify-between mb-6 -mx-1 md:-mx-2">
          <StatCard 
            label="Total Estimates" 
            value={stats.total.toString()} 
            indicatorText="All time" 
          />
          <StatCard 
            label="Pending Approval" 
            value={stats.pending.toString()} 
            indicatorText="Requires review" 
            indicatorType={stats.pending > 0 ? "warning" : "success"}
          />
          <StatCard 
            label="Total Value" 
            value={stats.value >= 1000000 ? `Rs. ${(stats.value / 1000000).toFixed(1)}M` : `Rs. ${stats.value}`} 
            indicatorText="Estimated cost" 
          />
        </View>

        {/* Top Section */}
        <QuotationForm onEstimateCreated={() => setRefreshTrigger(prev => prev + 1)} />

        {/* Bottom Section Layout */}
        <View className={`gap-6 pb-6 ${isMobile ? 'flex-col' : 'flex-row'}`}>
          <View className="flex-[4] w-full">
            <CostBreakdown refreshTrigger={refreshTrigger} />
          </View>
          
          <View className="flex-[5] w-full">
            <RecentEstimates refreshTrigger={refreshTrigger} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
