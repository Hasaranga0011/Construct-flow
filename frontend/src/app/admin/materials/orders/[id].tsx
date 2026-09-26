import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { api } from '../../../../services/api';

export default function AdminMaterialsOrdersIdPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          project:projects(name)
        `)
        .eq('id', id)
        .single();
        
      if (error) throw error;
      setOrder(data);
    } catch (err: any) {
      if (Platform.OS === 'web') console.error(err);
      else Alert.alert('Error', 'Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleUpdateStatus = async (newStatus: 'Confirmed' | 'Rejected' | 'Delivered' | 'Received') => {
    const proceed = await new Promise((resolve) => {
      Alert.alert(
        'Confirm Action',
        `Are you sure you want to mark this order as ${newStatus}?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yes', onPress: () => resolve(true) }
        ]
      );
    });
    if (!proceed) return;

    setActionLoading(true);
    try {
      if (!id) throw new Error('Order id is required');
      if (newStatus === 'Confirmed') await api.purchaseOrders.approve(id);
      if (newStatus === 'Rejected') await api.purchaseOrders.reject(id);
      if (newStatus === 'Delivered') await api.purchaseOrders.deliver(id);
      if (newStatus === 'Received') await api.purchaseOrders.receive(id);
      
      if (Platform.OS === 'web') window.alert(`Order marked as ${newStatus}!`);
      else Alert.alert('Success', `Order marked as ${newStatus}!`);
      
      // Refresh data
      fetchOrder();
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert('Failed to update status');
      else Alert.alert('Error', 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 bg-brand-light">
        <TopNav title="Order Not Found" showAction={false} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">The requested order could not be found.</Text>
          <Pressable onPress={() => router.back()} className="mt-4 bg-brand-orange px-6 py-2 rounded-lg">
            <Text className="text-white font-bold">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return 'bg-green-100 text-green-700 border-green-200';
      case 'Pending Delivery': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Confirmed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Rejected': case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const isCompleted = order.status === 'Received' || order.status === 'Rejected' || order.status === 'Cancelled';

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={`Order ${order.po_number}`} showAction={false} />
      
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[700px] w-full mx-auto">
          
          <Pressable onPress={() => router.back()} className="flex-row items-center mb-6 self-start">
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text className="text-gray-500 font-semibold ml-2">Back to Orders</Text>
          </Pressable>

          {/* Main Details Card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
            <View className="flex-row justify-between items-start mb-8 pb-6 border-b border-gray-100">
              <View>
                <Text className="text-3xl font-bold text-gray-800 mb-2">{order.po_number}</Text>
                <Text className="text-gray-500 flex-row items-center">
                  <Ionicons name="calendar-outline" size={14} /> Created on {format(new Date(order.created_at), 'MMM dd, yyyy')}
                </Text>
              </View>
              <View className={`px-4 py-2 rounded-lg border ${getStatusColor(order.status)}`}>
                <Text className="font-bold uppercase tracking-wide text-xs">{order.status}</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap mb-8">
              <View className="w-1/2 mb-6">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Supplier</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                    <FontAwesome5 name="truck" size={12} color="#3B82F6" />
                  </View>
                  <Text className="text-gray-800 font-medium text-base">{order.supplier_name || 'Unknown'}</Text>
                </View>
              </View>

              <View className="w-1/2 mb-6">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Site</Text>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center mr-3">
                    <FontAwesome5 name="hard-hat" size={12} color="#10B981" />
                  </View>
                  <Text className="text-gray-800 font-medium text-base">{order.project?.name || 'Unassigned'}</Text>
                </View>
              </View>

              <View className="w-1/2">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Expected Delivery</Text>
                <Text className="text-gray-800 font-medium text-base">
                  {order.expected_date ? format(new Date(order.expected_date), 'MMM dd, yyyy') : 'TBD'}
                </Text>
              </View>

              <View className="w-1/2">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Cost</Text>
                <Text className="text-brand-orange font-bold text-xl">
                  Rs. {(order.total_price || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Items Ordered Section */}
            <View className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <Text className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Items Ordered</Text>
              <View className="flex-row justify-between items-center py-3 border-b border-gray-200 mb-2">
                <Text className="text-gray-800 font-medium flex-1">{order.items}</Text>
                <Text className="text-gray-500 w-24 text-right">Qty: {order.quantity_ordered}</Text>
                <Text className="text-gray-800 font-bold w-32 text-right">Rs. {(order.unit_price || 0).toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between items-center pt-2">
                <Text className="text-gray-500 font-bold">Total</Text>
                <Text className="text-brand-orange font-bold text-lg">Rs. {(order.total_price || 0).toLocaleString()}</Text>
              </View>
            </View>

          </View>

          {/* Action Buttons Section */}
          {!isCompleted && (
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex-row justify-between items-center">
              <View className="flex-1 mr-4">
                <Text className="text-lg font-bold text-gray-800 mb-1">Update Order Status</Text>
                <Text className="text-gray-500 text-sm">Review the details above before confirming or rejecting this order.</Text>
              </View>
              
              <View className="flex-row gap-3">
                {order.status === 'Delivered' ? <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Received')}
                  className="bg-brand-success px-6 py-3 rounded-lg"
                >
                  <Text className="text-white font-bold">Confirm Receipt</Text>
                </Pressable> : <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Rejected')}
                  className="bg-red-50 border border-red-200 px-6 py-3 rounded-lg"
                >
                  <Text className="text-red-600 font-bold">Reject Order</Text>
                </Pressable>}
                
                {order.status === 'Confirmed' ? <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Delivered')}
                  className="bg-brand-orange shadow-sm px-6 py-3 rounded-lg flex-row items-center"
                >
                  {actionLoading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                  <Text className="text-white font-bold">Mark Delivered</Text>
                </Pressable> : order.status !== 'Delivered' ? <Pressable
                  disabled={actionLoading}
                  onPress={() => handleUpdateStatus('Confirmed')}
                  className="bg-brand-orange shadow-sm px-6 py-3 rounded-lg flex-row items-center"
                >
                  {actionLoading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                  <Text className="text-white font-bold">Confirm Order</Text>
                </Pressable> : null}
              </View>
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}
