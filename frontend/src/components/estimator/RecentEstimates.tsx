import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';

const EstimateRow = ({ 
  id,
  project, 
  date, 
  cost, 
  status,
  onApprove
}: { 
  id: number,
  project: string, 
  date: string, 
  cost: string, 
  status: 'Approved' | 'Draft' | 'Pending',
  onApprove: (id: number) => void
}) => {
  let statusBadgeColor = '';
  let statusTextColor = '';

  switch (status) {
    case 'Approved':
      statusBadgeColor = 'bg-[#DCFCE7]';
      statusTextColor = 'text-brand-success';
      break;
    case 'Draft':
      statusBadgeColor = 'bg-gray-100';
      statusTextColor = 'text-gray-600';
      break;
    case 'Pending':
      statusBadgeColor = 'bg-orange-100';
      statusTextColor = 'text-brand-orange';
      break;
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-50">
      <View className="w-1/4">
        <Text className="text-brand-text font-bold text-sm">{project}</Text>
      </View>
      <View className="w-1/4">
        <Text className="text-gray-500 text-xs">{date}</Text>
      </View>
      <View className="w-1/5">
        <Text className="text-brand-text font-bold text-sm">{cost}</Text>
      </View>
      <View className="w-1/5">
        <View className={`px-2 py-1 rounded self-start ${statusBadgeColor}`}>
          <Text className={`text-[10px] font-bold uppercase ${statusTextColor}`}>{status}</Text>
        </View>
      </View>
      <View className="flex-1 items-end flex-row justify-end gap-2">
        {status === 'Pending' && (
          <Pressable onPress={() => onApprove(id)} className="bg-brand-success px-2 py-1 rounded">
            <Text className="text-white text-xs font-semibold">Approve</Text>
          </Pressable>
        )}
        <Pressable onPress={() => alert('Opening PDF...')}>
          <Text className="text-brand-orange text-xs font-semibold">View PDF</Text>
        </Pressable>
      </View>
    </View>
  );
};

export const RecentEstimates = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [estimations, setEstimations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        
        if (isMounted) setEstimations(data || []);
      } catch (error) {
        console.warn('Failed to load estimates:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadEstimates();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleApprove = async (id: number) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('estimations').update({ status: 'Approved' }).eq('id', id);
      if (error) throw error;
      setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Approved' } : e));
    } catch (err) {
      console.warn('Failed to approve', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 ml-6 min-h-[300px]">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold text-brand-text">Recent Estimates</Text>
        <Pressable>
          <Text className="text-brand-orange text-sm font-semibold">View all {'>'}</Text>
        </Pressable>
      </View>

      <View className="flex-row py-2 border-b border-gray-100 mb-2">
        <Text className="w-1/4 text-xs font-semibold text-gray-400 uppercase">Project Name</Text>
        <Text className="w-1/4 text-xs font-semibold text-gray-400 uppercase">Date</Text>
        <Text className="w-1/5 text-xs font-semibold text-gray-400 uppercase">Estimated Cost</Text>
        <Text className="w-1/5 text-xs font-semibold text-gray-400 uppercase">Status</Text>
        <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase text-right"></Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : estimations.length === 0 ? (
          <View className="py-10 items-center">
            <Text className="text-gray-400">No estimations generated yet.</Text>
          </View>
        ) : (
          estimations.map((est) => (
            <EstimateRow 
              key={est.id}
              id={est.id}
              project={est.project_id || `Estimation #${est.id.toString().substring(0, 4)}`} 
              date={new Date(est.created_at).toLocaleDateString()} 
              cost={formatCurrency(est.estimated_cost)} 
              status={est.status || 'Pending'} 
              onApprove={handleApprove}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};
