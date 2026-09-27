import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export const ClientVariationOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadOrders = async () => {
      try {
        if (!user) return;
        setLoading(true);

        const { data: projectData } = await supabase
          .from('projects')
          .select('id')
          .eq('client_id', user.id);

        const projectIds = (projectData || []).map(p => p.id);
        
        if (projectIds.length > 0) {
          const { data, error } = await supabase
            .from('variation_orders')
            .select('*')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false });

          if (error) throw error;
          if (isMounted) setOrders(data || []);
        } else {
          if (isMounted) setOrders([]);
        }
      } catch (err) {
        console.warn('Failed to fetch variation orders:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadOrders();

    const channel = supabase
      .channel('client-variation-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'variation_orders' }, loadOrders)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleAction = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('variation_orders')
        .update({ status, approved_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', id);
        
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update variation order');
    }
  };

  const pendingCount = orders.filter(o => o.status === 'Pending').length;

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-brand-orange/30 flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Variation Orders</Text>
          <Text className="text-gray-500 text-xs">Scope changes requiring approval</Text>
        </View>
        {pendingCount > 0 && (
          <View className="bg-orange-50 px-3 py-1 rounded-full">
            <Text className="text-brand-orange text-xs font-bold">{pendingCount} Pending</Text>
          </View>
        )}
      </View>
      
      {loading ? (
        <ActivityIndicator color="#F97316" />
      ) : orders.length === 0 ? (
        <Text className="text-gray-400">No variation orders.</Text>
      ) : (
        orders.map(order => (
          order.status === 'Pending' ? (
            <View key={order.id} className="border border-gray-100 rounded-lg p-5 bg-gray-50 mb-4">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-brand-text text-base mb-1">{order.title}</Text>
                  <Text className="text-gray-500 text-xs">VO-{order.id.slice(0,6).toUpperCase()} • Pending Approval</Text>
                </View>
                <Text className="font-extrabold text-brand-orange text-lg">+Rs. {Number(order.amount).toLocaleString()}</Text>
              </View>
              
              {order.description && (
                <Text className="text-gray-600 text-sm leading-relaxed mb-5">{order.description}</Text>
              )}
              
              <View className="flex-row gap-3">
                <Pressable onPress={() => handleAction(order.id, 'Rejected')} className="flex-1 bg-white border border-gray-300 py-2.5 rounded-lg items-center hover:bg-gray-100 transition-colors">
                  <Text className="text-gray-700 font-bold">Reject</Text>
                </Pressable>
                <Pressable onPress={() => handleAction(order.id, 'Approved')} className="flex-1 bg-brand-success py-2.5 rounded-lg items-center shadow-sm hover:bg-green-600 transition-colors">
                  <Text className="text-white font-bold">Sign & Approve</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={order.id} className="border border-gray-100 rounded-lg p-4 flex-row justify-between items-center opacity-70 mb-2">
              <View className="flex-1 pr-2">
                <Text className="font-semibold text-gray-700 mb-1">{order.title}</Text>
                <Text className="text-gray-400 text-xs">VO-{order.id.slice(0,6).toUpperCase()} • {order.status}</Text>
              </View>
              <View className="items-end">
                <Text className="font-bold text-gray-600 mb-1">+Rs. {Number(order.amount).toLocaleString()}</Text>
                {order.status === 'Approved' || order.status === 'Implemented' ? (
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                ) : (
                  <Ionicons name="close-circle" size={16} color="#EF4444" />
                )}
              </View>
            </View>
          )
        ))
      )}
    </View>
  );
};
