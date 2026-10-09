import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { formatMoney } from '@/utils/format';

export default function SupplierDetailPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [supplier, setSupplier] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data: sup, error: supErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();
          
        if (supErr) {
          if (supErr.code === 'PGRST116') {
             // Not found
             if (isMounted) setSupplier(null);
          } else {
             throw supErr;
          }
        } else {
           if (isMounted) setSupplier(sup);
        }
        
        const { data: sessionData } = await supabase.auth.getSession();
        const pmId = sessionData.session?.user.id;
        if (!pmId) throw new Error('Please sign in again.');

        const { data: ords, error: ordErr } = await supabase
          .from('purchase_orders')
          .select('*, projects!inner(name, pm_id)')
          .eq('supplier_id', id)
          .eq('projects.pm_id', pmId)
          .order('created_at', { ascending: false });
        if (ordErr) throw ordErr;
        
        if (isMounted) {
          setOrders(ords || []);
        }
      } catch (err: any) {
        console.error('Error fetching supplier details', err);
        if (isMounted) setErrorMsg(err.message || 'Could not load supplier');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [id, refreshTrigger]);

  if (loading) {
    return (
      <View className="flex-1 bg-brand-light">
        <TopNav title="Supplier Details" actionLabel="Back" onActionPress={() => router.back()} />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View className="flex-1 bg-brand-light">
        <TopNav title="Supplier Details" actionLabel="Back" onActionPress={() => router.back()} />
        <View className="flex-1 justify-center items-center p-4">
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 mt-4 text-center">{errorMsg}</Text>
          <Pressable onPress={() => setRefreshTrigger(v => v + 1)} className="mt-4 bg-brand-orange px-6 py-2 rounded-lg">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!supplier) {
    return (
      <View className="flex-1 bg-brand-light">
        <TopNav title="Supplier Details" actionLabel="Back" onActionPress={() => router.back()} />
        <View className="flex-1 justify-center items-center p-4">
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-4 text-center">Supplier not found</Text>
        </View>
      </View>
    );
  }

  const activeOrders = orders.filter(o => ['Pending Delivery', 'Suggested', 'Confirmed'].includes(o.status)).length;
  const deliveredOrders = orders.filter(o => o.status === 'Delivered').length;
  const recentOrders = orders.slice(0, 5);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={supplier.full_name || 'Supplier'} actionLabel="Back" onActionPress={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        
        {/* Contact Details */}
        <View className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-gray-100">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 rounded-full bg-brand-orange/10 items-center justify-center mr-4">
              <MaterialCommunityIcons name="store" size={24} color="#F97316" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-900">{supplier.full_name}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">{supplier.email}</Text>
            </View>
          </View>
          <View className="flex-row items-center pt-2 border-t border-gray-100">
            <Ionicons name="calendar-outline" size={16} color="#6B7280" className="mr-2" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Joined {format(new Date(supplier.created_at), 'MMM d, yyyy')}</Text>
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row justify-between mb-4">
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 mr-2 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-gray-900">{activeOrders}</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">Active Orders</Text>
          </View>
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 ml-2 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-gray-900">{deliveredOrders}</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">Delivered</Text>
          </View>
        </View>

        <Pressable 
          style={{ minHeight: 44 }}
          onPress={() => router.push(`/pm/suppliers/${id}/orders`)}
          className="bg-brand-orange rounded-xl p-4 items-center justify-center mb-6 shadow-sm flex-row"
        >
          <MaterialCommunityIcons name="truck-delivery" size={20} color="white" className="mr-2" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Manage All Orders</Text>
        </Pressable>

        {/* Recent Orders */}
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-900 mb-4 px-1">Recent Orders</Text>
        {recentOrders.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 items-center shadow-sm border border-gray-100">
            <MaterialCommunityIcons name="file-document-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-2">No orders found.</Text>
          </View>
        ) : (
          recentOrders.map(order => (
            <Pressable
              key={order.id}
              style={{ minHeight: 60 }}
              onPress={() => router.push(`/pm/suppliers/${id}/orders`)}
              className="bg-white rounded-2xl p-5 mb-3 shadow-sm border border-gray-100 flex-row justify-between items-center"
            >
              <View className="flex-1 pr-4">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-900 text-base mb-1" numberOfLines={1}>
                  {order.po_number || order.items || 'Order'}
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">{order.projects?.name || 'Unknown Project'}</Text>
              </View>
              <View className="items-end">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-orange mb-1">
                  {order.total_price != null ? formatMoney(order.total_price) : 'Rs. 0'}
                </Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{order.status}</Text>
              </View>
            </Pressable>
          ))
        )}

      </ScrollView>
    </View>
  );
}
