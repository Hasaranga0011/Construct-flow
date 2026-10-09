import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';
import { SearchInput } from '@/components/common/SearchInput';
import { useDebounce } from '@/hooks/useDebounce';

export default function AdminSuppliersIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [stats, setStats] = useState({ total: 0, activeOrders: 0, recentDeliveries: 0 });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Setup Realtime subscriptions
    const subProfiles = supabase.channel('admin-suppliers-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: "role=eq.supplier" }, () => {
        setRefreshTrigger(prev => prev + 1);
      }).subscribe();

    const subOrders = supabase.channel('admin-suppliers-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
        setRefreshTrigger(prev => prev + 1);
      }).subscribe();

    return () => {
      supabase.removeChannel(subProfiles);
      supabase.removeChannel(subOrders);
    };
  }, []);

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
          .select('id, supplier_id, status, total_price, created_at');

        if (ordErr) throw ordErr;

        const activeStatuses = ['Pending Delivery', 'Suggested', 'Confirmed'];
        const recentDeliveries = orders?.filter(o => o.status === 'Delivered' && new Date(o.created_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)).length || 0;

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
              totalSpent: supplierOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.total_price || 0), 0)
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
  }, [refreshTrigger]);

  const filteredSuppliers = suppliers.filter(s => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return s.full_name?.toLowerCase().includes(searchLower) ||
           s.email?.toLowerCase().includes(searchLower);
  });

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav title="Suppliers Directory" />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>

        {/* Stat Cards */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center mr-4">
              <Ionicons name="business" size={24} color="#3B82F6" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-extrabold text-brand-text mb-1">{stats.total}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold text-sm">Registered Suppliers</Text>
            </View>
          </View>

          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
              <Ionicons name="cart" size={24} color="#F97316" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-extrabold text-brand-text mb-1">{stats.activeOrders}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold text-sm">Active Orders</Text>
            </View>
          </View>

          <View className="flex-1 bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mr-4">
              <MaterialCommunityIcons name="truck-check" size={24} color="#10B981" />
            </View>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-extrabold text-brand-text mb-1">{stats.recentDeliveries}</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold text-sm">Deliveries this Week</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Supplier Database</Text>
          <SearchInput items={suppliers} entityLabel="suppliers"
            placeholder="Search by name or email..."
            value={search}
            onChangeText={setSearch}
            className={isMobile ? "w-full" : "w-64"}
            config={{
              table: 'profiles',
              searchColumn: 'full_name',
              secondaryColumn: 'email',
              titleColumn: 'full_name',
              subtitleColumn: 'email',
              routePrefix: '/admin/suppliers/',
              filterColumn: 'role',
              filterValue: 'supplier'
            }}
          />
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Supplier Name</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Active Orders</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-right">Total Spent</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>
          )}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : filteredSuppliers.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="people-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No suppliers found.</Text>
            </View>
          ) : (
            filteredSuppliers.map((sup, idx) => (
              isMobile ? (
                <View key={sup.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#1D4ED8', fontWeight: 'bold' }]}>{sup.full_name?.charAt(0) || 'S'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16 }]}>{sup.full_name || 'Unnamed'}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>{sup.email || 'No email provided'}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Active Orders</Text>
                      <View style={{ backgroundColor: sup.activeOrders > 0 ? '#FFEDD5' : '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 12, fontWeight: 'bold', color: sup.activeOrders > 0 ? '#C2410C' : '#6B7280' }]}>
                          {sup.activeOrders} Pending
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Total Spent</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 14 }]}>
                        {formatMoney(sup.totalSpent || 0)}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => router.push(`/admin/suppliers/${sup.id}` as any)}
                    style={[{ backgroundColor: '#111827', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontSize: 14, fontWeight: 'bold' }]}>View Profile</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={sup.id} className="flex-row items-center py-4 border-b border-gray-50">
                  <View className="w-[30%] pr-2 flex-row items-center">
                    <View className="w-11 h-11 rounded-full bg-blue-100 items-center justify-center mr-3">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 font-bold">{sup.full_name?.charAt(0) || 'S'}</Text>
                    </View>
                    <View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{sup.full_name || 'Unnamed'}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">Joined {format(new Date(sup.created_at), 'MMM yyyy')}</Text>
                    </View>
                  </View>

                  <View className="w-[20%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs truncate">{sup.email || 'No email provided'}</Text>
                  </View>

                  <View className="w-[15%] flex-row justify-center">
                    <View className={`px-2 py-1 rounded-full ${sup.activeOrders > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${sup.activeOrders > 0 ? 'text-orange-700' : 'text-gray-500'}`}>
                        {sup.activeOrders} Pending
                      </Text>
                    </View>
                  </View>

                  <View className="w-[15%]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-right text-sm">
                      {formatMoney(sup.totalSpent || 0)}
                    </Text>
                  </View>

                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => router.push(`/admin/suppliers/${sup.id}` as any)}
                      className="bg-brand-dark px-4 py-1.5 rounded-md shadow-sm hover:bg-gray-800"
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Profile</Text>
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
