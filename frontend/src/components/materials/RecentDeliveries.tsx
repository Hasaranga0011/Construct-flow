import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const DeliveryRow = ({ title, project, time }: { title: string, project: string, time: string }) => {
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      {/* Icon */}
      <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
        <FontAwesome5 name="truck" size={16} color="#F97316" />
      </View>
      
      {/* Content */}
      <View className="flex-1">
        <Text className="text-brand-text font-bold text-sm mb-0.5">{title}</Text>
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{project}</Text>
      </View>
      
      {/* Time */}
      <Text className="text-gray-400 text-xs">{time}</Text>
    </View>
  );
};

export const RecentDeliveries = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadDeliveries = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id, items, status, 
            actual_delivery, created_at,
            projects!inner(name)
          `)
          .eq('status', 'Delivered')
          .order('actual_delivery', { ascending: false })
          .limit(5);

        if (error) throw error;
        
        if (isMounted) setDeliveries(data || []);
      } catch (error) {
        console.warn('Failed to load recent deliveries:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadDeliveries();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <View className="mb-4">
        <Text className="text-lg font-bold text-brand-text">Recent Deliveries</Text>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#F97316" />
        ) : deliveries.length === 0 ? (
          <Text className="text-gray-400 text-sm">No recent deliveries.</Text>
        ) : (
          deliveries.map(d => {
            const projectName = d.projects?.name || 'Unknown';
            const items = d.items || [];
            const itemsStr = Array.isArray(items) && items.length > 0 
              ? items.map(i => i.item_name).join(', ') 
              : 'Materials';
              
            return (
              <DeliveryRow 
                key={d.id}
                title={`${itemsStr} delivered`} 
                project={projectName} 
                time={d.actual_delivery ? new Date(d.actual_delivery).toLocaleDateString() : new Date(d.created_at).toLocaleDateString()} 
              />
            );
          })
        )}
      </View>
    </View>
  );
};
