import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const DeliveryRow = ({ title, project, time }: { title: string, project: string, time: string }) => {
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      {/* Icon */}
      <View className="w-11 h-11 rounded-full bg-orange-100 items-center justify-center mr-3">
        <FontAwesome5 name="truck" size={16} color="#F97316" />
      </View>
      
      {/* Content */}
      <View className="flex-1">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm mb-0.5">{title}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{project}</Text>
      </View>
      
      {/* Time */}
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs">{time}</Text>
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
            actual_delivery, created_at, updated_at,
            projects!inner(name)
          `)
          .eq('status', 'Received')
          .order('updated_at', { ascending: false })
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
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Recent Deliveries</Text>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#F97316" />
        ) : deliveries.length === 0 ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">No recent deliveries.</Text>
        ) : (
          deliveries.map(d => {
            const projectName = d.projects?.name || 'Unknown';
            const items = d.items;
            const itemsStr = typeof items === 'string' ? items : 'Materials';
              
            return (
              <DeliveryRow 
                key={d.id}
                title={`${itemsStr} received`} 
                project={projectName} 
                time={d.updated_at ? new Date(d.updated_at).toLocaleDateString() : (d.actual_delivery ? new Date(d.actual_delivery).toLocaleDateString() : new Date(d.created_at).toLocaleDateString())} 
              />
            );
          })
        )}
      </View>
    </View>
  );
};
