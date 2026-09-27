import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

const OrderRow = ({ order, onDeliver }: { order: any, onDeliver: (id: string) => void }) => {
  const projectName = order.projects?.name || 'Unknown';
  
  return (
    <View className="flex-row items-center py-3 border-b border-gray-50">
      {/* Icon */}
      <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center mr-3">
        <FontAwesome5 name="box-open" size={16} color="#3B82F6" />
      </View>
      
      {/* Content */}
      <View className="flex-1">
        <Text className="text-brand-text font-bold text-sm mb-0.5">{order.supplier_name}</Text>
        <Text className="text-gray-500 text-[10px] mb-1">Expected: {order.expected_date || 'TBD'}</Text>
        <Text className="text-gray-500 text-xs truncate" numberOfLines={1}>{order.po_number} - {projectName}</Text>
      </View>
      
      <Pressable 
        onPress={() => onDeliver(order.id)}
        className="bg-brand-success px-3 py-1.5 rounded-md"
      >
        <Text className="text-white text-xs font-bold">Confirm Received</Text>
      </Pressable>
    </View>
  );
};

export const PendingOrders = ({ refreshTrigger = 0, onRefreshNeeded }: { refreshTrigger?: number, onRefreshNeeded: () => void }) => {
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
            id, supplier_name, po_number, status, expected_date,
            projects!inner(name)
          `)
          .eq('status', 'Pending Delivery') // only show pending deliveries
          .order('expected_date', { ascending: true })
          .limit(5);

        if (error) throw error;
        
        if (isMounted) setOrders(data || []);
      } catch (error) {
        console.warn('Failed to load pending orders:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadOrders();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleDeliver = async (id: string) => {
    try {
      setLoading(true);
      await api.purchaseOrders.receive(id); // Fixed Bug 16: Admin confirms receipt
      onRefreshNeeded();
    } catch (e: any) {
      console.error("Confirm Received failed:", e);
      Alert.alert('Error', e.message || e.detail || 'Failed to confirm received');
      setLoading(false);
    }
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
      <View className="mb-4">
        <Text className="text-lg font-bold text-brand-text">Expected Deliveries</Text>
        <Text className="text-brand-text-muted text-xs">Approved by Supplier</Text>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#F97316" />
        ) : orders.length === 0 ? (
          <Text className="text-gray-400 text-sm">No approved orders pending delivery.</Text>
        ) : (
          orders.map(order => (
            <OrderRow 
              key={order.id}
              order={order} 
              onDeliver={handleDeliver}
            />
          ))
        )}
      </View>
    </View>
  );
};
