import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';

export default function AdminSuppliersIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [stats, setStats] = useState({ total: 0, activeOrders: 0, recentDeliveries: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        // Fetch users with role 'supplier'
        const { data: sups, error: supErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, created_at, email')
          .eq('role', 'supplier');
          
        if (supErr) throw supErr;
        
        // Fetch order stats for these suppliers
        const { data: orders, error: ordErr } = await supabase
          .from('purchase_orders')
          .select('id, supplier_id, status, total_cost, updated_at');
          
        if (ordErr) throw ordErr;
        
        const activeStatuses = ['Pending Delivery', 'Suggested', 'Confirmed'];
        const recentDeliveries = orders?.filter(o => o.status === 'Delivered' && new Date(o.updated_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)).length || 0;
        
        if (isMounted) {
          setStats({
            total: sups?.length || 0,
            activeOrders: orders?.filter(o => activeStatuses.includes(o.status)).length || 0,
            recentDeliveries
          });
          
          const enrichedSuppliers = sups?.map(s => {
            const supplierOrders = orders?.filter(o => o.supplier_id === s.id) || [];
            return {
              ...s,
              totalOrders: supplierOrders.length,
              activeOrders: supplierOrders.filter(o => activeStatuses.includes(o.status)).length,
              totalSpent: supplierOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.total_cost || 0), 0)
            };
          }) || [];
          
          setSuppliers(enrichedSuppliers);
        }
      } catch (err) {
        console.error('Error fetching suppliers', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchData();
    return () => { isMounted = false; };
  }, []);

  const filteredSuppliers = suppliers.filter(s => 
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav title="Suppliers Directory" />
      
      <ScrollView className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        
        {/* Stat Cards */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center mr-4">
              <Ionicons name="business" size={24} color="#3B82F6" />
            </View>
            <View>
              <Text className="text-3xl font-extrabold text-brand-text mb-1">{stats.total}</Text>
              <Text className="text-gray-500 font-semibold text-sm">Registered Suppliers</Text>
            </View>
          </View>
          
          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
              <Ionicons name="cart" size={24} color="#F97316" />
            </View>
            <View>
              <Text className="text-3xl font-extrabold text-brand-text mb-1">{stats.activeOrders}</Text>
              <Text className="text-gray-500 font-semibold text-sm">Active Orders</Text>
            </View>
          </View>
          
          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mr-4">
              <MaterialCommunityIcons name="truck-check" size={24} color="#10B981" />
            </View>
            <View>
              <Text className="text-3xl font-extrabold text-brand-text mb-1">{stats.recentDeliveries}</Text>
              <Text className="text-gray-500 font-semibold text-sm">Deliveries this Week</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0 }}>
          <Text className="text-2xl font-bold text-brand-text">Supplier Database</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput 
              className="flex-1 ml-2 text-sm text-brand-text outline-none"
              placeholder="Search by name or email..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Supplier Name</Text>
              <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Active Orders</Text>
              <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-right">Total Spent</Text>
              <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>
          )}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : filteredSuppliers.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text className="text-gray-400 text-lg font-medium">No suppliers found.</Text>
            </View>
          ) : (
            filteredSuppliers.map((sup, idx) => (
              isMobile ? (
                <View key={sup.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ color: '#1D4ED8', fontWeight: 'bold' }}>{sup.full_name?.charAt(0) || 'S'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 16 }}>{sup.full_name || 'Unnamed'}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>{sup.email || 'No email provided'}</Text>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Active Orders</Text>
                      <View style={{ backgroundColor: sup.activeOrders > 0 ? '#FFEDD5' : '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: sup.activeOrders > 0 ? '#C2410C' : '#6B7280' }}>
                          {sup.activeOrders} Pending
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Total Spent</Text>
                      <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 14 }}>
                        {formatMoney(sup.totalSpent || 0)}
                      </Text>
                    </View>
                  </View>
                  
                  <Pressable 
                    onPress={() => router.push(`/admin/suppliers/${sup.id}/orders`)} 
                    style={{ backgroundColor: '#111827', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>View Profile</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={sup.id} className="flex-row items-center py-4 border-b border-gray-50">
                  <View className="w-[30%] pr-2 flex-row items-center">
                    <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center mr-3">
                      <Text className="text-blue-700 font-bold">{sup.full_name?.charAt(0) || 'S'}</Text>
                    </View>
                    <View>
                      <Text className="text-brand-text font-bold text-sm truncate">{sup.full_name || 'Unnamed'}</Text>
                      <Text className="text-gray-400 text-[10px]">Joined {format(new Date(sup.created_at), 'MMM yyyy')}</Text>
                    </View>
                  </View>
                  
                  <View className="w-[20%] pr-2">
                    <Text className="text-gray-600 text-xs truncate">{sup.email || 'No email provided'}</Text>
                  </View>
  
                  <View className="w-[15%] flex-row justify-center">
                    <View className={`px-2 py-1 rounded-full ${sup.activeOrders > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
                      <Text className={`text-xs font-bold ${sup.activeOrders > 0 ? 'text-orange-700' : 'text-gray-500'}`}>
                        {sup.activeOrders} Pending
                      </Text>
                    </View>
                  </View>
                  
                  <View className="w-[15%]">
                    <Text className="text-brand-text font-bold text-right text-sm">
                      {formatMoney(sup.totalSpent || 0)}
                    </Text>
                  </View>
                  
                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable 
                      onPress={() => router.push(`/admin/suppliers/${sup.id}/orders`)} 
                      className="bg-brand-dark px-4 py-1.5 rounded-md shadow-sm hover:bg-gray-800"
                    >
                      <Text className="text-white text-xs font-bold">Profile</Text>
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
