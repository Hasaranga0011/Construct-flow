import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

type PurchaseOrder = {
  id: string;
  material_id: string;
  quantity: number;
  total_price: number;
  status: string;
  expected_delivery: string | null;
  materials?: {
    name?: string | null;
    item_name?: string | null;
    unit?: string | null;
  };
};

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;
const formatDate = (dateString?: string | null) => dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'Not set';

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    'Confirmed': 'bg-green-100 text-green-700',
    'Pending Delivery': 'bg-yellow-100 text-yellow-700',
    'Delivered': 'bg-blue-100 text-blue-700',
    'Rejected': 'bg-red-100 text-red-700',
    'Cancelled': 'bg-gray-100 text-gray-700',
    'Suggested': 'bg-purple-100 text-purple-700',
  };
  const colorClass = colors[status] || 'bg-gray-100 text-gray-700';
  return (
    <View className={`px-2 py-1 rounded-full ${colorClass.split(' ')[0]}`}>
      <Text className={`text-xs font-semibold ${colorClass.split(' ')[1]}`}>{status}</Text>
    </View>
  );
};

export default function AdminSupplierOrdersPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [supplierName, setSupplierName] = useState('Supplier');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const loadOrders = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const [profileRes, ordersRes] = await Promise.all([
          supabase.from('profiles').select('full_name, company_name').eq('id', id).single(),
          supabase.from('purchase_orders')
            .select(`
              id, material_id, quantity, total_price, status, expected_delivery,
              materials (name, item_name, unit)
            `)
            .eq('supplier_id', id)
            .order('created_at', { ascending: false })
        ]);

        if (profileRes.error) throw profileRes.error;
        if (ordersRes.error) throw ordersRes.error;

        if (isMounted) {
          setSupplierName(profileRes.data?.company_name || profileRes.data?.full_name || 'Supplier');
          setOrders((ordersRes.data || []) as PurchaseOrder[]);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load supplier orders.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadOrders();
    const channel = supabase.channel(`admin-supplier-orders:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `supplier_id=eq.${id}` }, () => setRefreshTrigger(v => v + 1))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [id, refreshTrigger]);

  const handleAction = async (orderId: string, action: 'approve' | 'reject' | 'deliver') => {
    const confirmMessage = `Are you sure you want to ${action} this order?`;
    
    const executeAction = async () => {
      setActionLoading(orderId);
      try {
        if (action === 'approve') await api.purchaseOrders.approve(orderId);
        else if (action === 'reject') await api.purchaseOrders.reject(orderId);
        else if (action === 'deliver') await api.purchaseOrders.deliver(orderId);
        
        setRefreshTrigger(v => v + 1);
      } catch (err: any) {
        const msg = err.message || `Failed to ${action} order.`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
      } finally {
        setActionLoading(null);
      }
    };

    Alert.alert('Confirm Action', confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: executeAction }
    ]);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={`${supplierName} Orders`} showAction={false} />
      
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-brand-danger text-center mb-4">{error}</Text>
          <Pressable onPress={() => setRefreshTrigger(t => t + 1)} className="bg-brand-orange px-6 py-3 rounded-lg">
            <Text className="text-white font-semibold">Retry</Text>
          </Pressable>
        </View>
      ) : orders.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="folder-open-outline" size={48} color="#6B7280" />
          <Text className="text-brand-text-muted mt-3 text-center">No orders found for this supplier</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 800 }} className="w-full">
              {/* Table Header */}
              <View className="flex-row items-center bg-gray-50 border-b border-gray-200 py-3 px-4 rounded-t-lg">
                <Text className="flex-[2] text-xs font-semibold text-gray-500 uppercase">Material</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase">Quantity</Text>
                <Text className="flex-[1.5] text-xs font-semibold text-gray-500 uppercase">Total Amount</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase">Expected</Text>
                <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text className="flex-[1.5] text-xs font-semibold text-gray-500 uppercase text-right">Actions</Text>
              </View>

              {/* Table Rows */}
              {orders.map((order) => {
                const matName = order.materials?.name || order.materials?.item_name || 'Unknown Material';
                const matUnit = order.materials?.unit || '';
                
                return (
                  <View key={order.id} className="flex-row items-center border-b border-gray-100 py-4 px-4 bg-white">
                    <Text className="flex-[2] text-sm text-brand-text font-medium" numberOfLines={1}>{matName}</Text>
                    <Text className="flex-1 text-sm text-gray-600">{order.quantity} {matUnit}</Text>
                    <Text className="flex-[1.5] text-sm font-semibold text-brand-text">{formatCurrency(order.total_price)}</Text>
                    <Text className="flex-1 text-sm text-gray-600">{formatDate(order.expected_delivery)}</Text>
                    <View className="flex-1 items-start">{getStatusBadge(order.status)}</View>
                    <View className="flex-[1.5] flex-row justify-end items-center gap-2">
                      {actionLoading === order.id ? (
                        <ActivityIndicator size="small" color="#F97316" />
                      ) : (
                        <>
                          {(order.status === 'Pending Delivery' || order.status === 'Suggested') && (
                            <>
                              <Pressable onPress={() => handleAction(order.id, 'approve')} className="bg-green-100 px-3 py-2 rounded-lg">
                                <Text className="text-green-700 text-xs font-bold">Approve</Text>
                              </Pressable>
                              <Pressable onPress={() => handleAction(order.id, 'reject')} className="bg-red-100 px-3 py-2 rounded-lg">
                                <Text className="text-red-700 text-xs font-bold">Reject</Text>
                              </Pressable>
                            </>
                          )}
                          {order.status === 'Confirmed' && (
                            <Pressable onPress={() => handleAction(order.id, 'deliver')} className="bg-blue-100 px-3 py-2 rounded-lg">
                              <Text className="text-blue-700 text-xs font-bold">Mark Delivered</Text>
                            </Pressable>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}
