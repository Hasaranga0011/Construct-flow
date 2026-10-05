import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

const DeliveryRow = ({ order }: { order: any }) => {
  const router = useRouter();
  const projectName = order.projects?.name || 'Unknown';
  
  // Check if expected delivery date has passed
  const today = new Date().toISOString().split('T')[0];
  const isLate = order.expected_date && order.expected_date < today;

  return (
    <Pressable 
      onPress={() => router.push(`/admin/materials/orders/${order.id}`)}
      className={`flex-row items-center py-3 border-b border-gray-50 ${isLate ? 'bg-red-50/30' : ''}`}
    >
      <View className={`w-11 h-11 rounded-full items-center justify-center mr-3 ${isLate ? 'bg-red-100' : 'bg-orange-100'}`}>
        <FontAwesome5 name="truck-loading" size={16} color={isLate ? '#EF4444' : '#F97316'} />
      </View>
      
      <View className="flex-1">
        <View className="flex-row items-center mb-0.5">
          <Text className="text-brand-text font-bold text-sm mr-2">{order.supplier_name}</Text>
          {isLate && (
             <View className="bg-red-100 px-2 py-0.5 rounded">
                <Text className="text-red-700 text-[10px] font-bold uppercase">Late</Text>
             </View>
          )}
        </View>
        <Text className="text-gray-500 text-[10px] mb-1">
          Due: {order.expected_date || 'TBD'} | Qty: {order.quantity_ordered} | Rs. {order.total_price}
        </Text>
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{order.po_number} - {projectName}</Text>
      </View>
      
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </Pressable>
  );
};

export const PendingDeliveries = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadOrders = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id, supplier_name, po_number, status, expected_date, quantity_ordered, total_price,
            projects!inner(name)
          `)
          .in('status', ['Confirmed']) // only show confirmed (agreed but not dispatched)
          .order('expected_date', { ascending: true })
          .limit(5);

        if (error) throw error;
        
        if (isMounted) setOrders(data || []);
      } catch (error) {
        console.warn('Failed to load pending deliveries:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadOrders();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="mb-4">
        <Text className="text-lg font-bold text-brand-text">Pending Deliveries</Text>
        <Text className="text-brand-text-muted text-xs">Confirmed, Awaiting Dispatch</Text>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#F97316" />
        ) : orders.length === 0 ? (
          <Text className="text-gray-400 text-sm">No confirmed orders awaiting dispatch.</Text>
        ) : (
          orders.map(order => (
            <DeliveryRow 
              key={order.id}
              order={order} 
            />
          ))
        )}
      </View>
    </View>
  );
};
