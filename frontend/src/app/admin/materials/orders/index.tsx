import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../../hooks/useResponsive';
import { formatMoney } from '../../../../utils/format';

export default function AdminPurchaseOrders() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      try {
        let query = supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });
        
        if (statusFilter !== 'All') {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Manual search filter since Supabase ilike doesn't cross join tables easily without a view
        let filteredData = data || [];
        if (search) {
          filteredData = filteredData.filter(o => 
            o.po_number?.toLowerCase().includes(search.toLowerCase()) || 
            o.items?.toLowerCase().includes(search.toLowerCase()) ||
            o.supplier_name?.toLowerCase().includes(search.toLowerCase())
          );
        }
        
        if (isMounted) setOrders(filteredData);
      } catch (err) {
        console.error('Error fetching orders', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchOrders();
    return () => { isMounted = false; };
  }, [search, statusFilter]);

  const statuses = ['All', 'Pending Delivery', 'Suggested', 'Rejected', 'Confirmed', 'Delivered', 'Cancelled'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return 'bg-green-100 text-green-700';
      case 'Pending Delivery': return 'bg-orange-100 text-orange-700';
      case 'Suggested': return 'bg-yellow-100 text-yellow-700';
      case 'Rejected': case 'Cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav 
        title="Purchase Orders" 
        actionLabel="+ New Order" 
        onActionPress={() => router.push('/admin/materials/orders/create')} 
      />
      
      <ScrollView className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/admin/materials')} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Materials</Text>
        </Pressable>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <Text className="text-2xl font-bold text-brand-text">All Orders</Text>
          
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, width: '100%', flexWrap: 'wrap' }}>
            <View className="flex-row flex-1 min-w-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {statuses.map(s => (
                  <Pressable 
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    className={`px-4 py-2 ${statusFilter === s ? 'bg-brand-orange' : 'hover:bg-gray-50'}`}
                  >
                    <Text className={`font-semibold text-xs ${statusFilter === s ? 'text-white' : 'text-gray-500'}`}>{s}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search PO, Item, Supplier..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
        </View>
        
        <View style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">PO Number</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Material / Qty</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Supplier</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Total Cost</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>
          )}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : orders.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="cart-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium">No purchase orders found.</Text>
            </View>
          ) : (
            orders.map(o => (
              isMobile ? (
                <View key={o.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 16 }}>{o.items || 'Unknown'}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>PO: {o.po_number || 'N/A'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View className={`px-2 py-1 rounded ${getStatusColor(o.status)}`}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>{o.status}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Supplier</Text>
                      <Text style={{ color: '#374151', fontWeight: '600' }}>{o.supplier_name || 'Unassigned'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Total Cost</Text>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 14 }}>
                        {formatMoney(o.total_price || 0)}
                      </Text>
                    </View>
                  </View>
                  
                  <Pressable 
                    onPress={() => router.push(`/admin/materials/orders/${o.id}`)} 
                    style={{ backgroundColor: '#F97316', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>View Order</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={o.id} className="flex-row items-center py-4 border-b border-gray-100">
                  <View className="w-[15%] pr-2">
                    <Text className="text-brand-text font-bold text-sm truncate">{o.po_number || 'N/A'}</Text>
                    <Text className="text-gray-400 text-[10px]">{format(new Date(o.created_at), 'MMM dd, yyyy')}</Text>
                  </View>
                  
                  <View className="w-[20%] pr-2">
                    <Text className="text-brand-text font-semibold text-sm truncate">{o.items || 'Unknown'}</Text>
                    <Text className="text-gray-500 text-xs">Qty: {o.quantity_ordered || 0}</Text>
                  </View>
  
                  <View className="w-[20%] pr-2">
                    <Text className="text-gray-600 text-sm truncate">{o.supplier_name || 'Unassigned'}</Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <Text className="text-brand-text text-sm font-bold">
                      {formatMoney(o.total_price || 0)}
                    </Text>
                  </View>
                  
                  <View className="w-[15%]">
                    <View className={`px-2 py-1 rounded self-start ${getStatusColor(o.status)}`}>
                      <Text className={`text-[10px] font-bold uppercase`}>
                        {o.status}
                      </Text>
                    </View>
                  </View>
                  
                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable 
                      onPress={() => router.push(`/admin/materials/orders/${o.id}`)} 
                      className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm"
                    >
                      <Text className="text-white text-xs font-bold">View</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
