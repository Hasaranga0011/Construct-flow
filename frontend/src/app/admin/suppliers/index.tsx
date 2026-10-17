import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';
import { format } from 'date-fns';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatMoney } from '../../../utils/format';
import { SearchInput } from '@/components/common/SearchInput';
import { useDebounce } from '@/hooks/useDebounce';
import { RoleAvatar } from '@/components/common/RoleAvatar';
import { StatCard } from '@/components/common/StatCard';
import { AnimatedCard } from '@/components/common/AnimatedCard';

export default function AdminSuppliersIndex() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const debouncedSearch = useDebounce(search, 300);

  const [stats, setStats] = useState({ total: 0, activeOrders: 0, recentDeliveries: 0, totalSpent: 0 });
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
          .select('id, full_name, role, created_at, email, avatar_url, company_name, supplier_type, contact_number')
          .eq('role', 'supplier');

        if (supErr) throw supErr;

        // Fetch order stats for these suppliers
        const { data: orders, error: ordErr } = await supabase
          .from('purchase_orders')
          .select('id, supplier_id, status, total_price, created_at');

        if (ordErr) throw ordErr;

        const activeStatuses = ['Pending Delivery', 'Suggested', 'Confirmed'];
        const recentDeliveries = orders?.filter(o => o.status === 'Delivered' && !!o.created_at && new Date(o.created_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)).length || 0;
        const totalSpent = orders?.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.total_price || 0), 0) || 0;

        if (isMounted) {
          setStats({
            total: sups?.length || 0,
            activeOrders: orders?.filter(o => !!o.status && activeStatuses.includes(o.status)).length || 0,
            recentDeliveries,
            totalSpent
          });

          const enrichedSuppliers = sups?.map(s => {
            const supplierOrders = orders?.filter(o => o.supplier_id === s.id) || [];
            return {
              ...s,
              totalOrders: supplierOrders.length,
              activeOrders: supplierOrders.filter(o => !!o.status && activeStatuses.includes(o.status)).length,
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
           s.company_name?.toLowerCase().includes(searchLower) ||
           s.email?.toLowerCase().includes(searchLower);
  });

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav title="Suppliers Directory" />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>

        {/* Top Stat Cards Row */}
        <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
          <AnimatedCard delay={100} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
            <StatCard 
              label="Registered Suppliers" 
              value={stats.total.toString()} 
              indicatorText="Active vendor network" 
              indicatorType="neutral" 
              colorScheme="blue"
              icon={<Ionicons name="business" size={20} color="#2563EB" />}
              fullWidth
            />
          </AnimatedCard>
          <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
            <StatCard 
              label="Active Orders" 
              value={stats.activeOrders.toString()} 
              indicatorText={stats.activeOrders > 0 ? "Pending fulfillment" : "All orders fulfilled"} 
              indicatorType={stats.activeOrders > 0 ? "warning" : "success"}
              colorScheme="amber"
              icon={<Ionicons name="cart" size={20} color="#D97706" />}
              fullWidth
            />
          </AnimatedCard>
          <AnimatedCard delay={300} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
            <StatCard 
              label="Weekly Deliveries" 
              value={stats.recentDeliveries.toString()} 
              indicatorText="Past 7 days" 
              indicatorType="success" 
              colorScheme="emerald"
              icon={<Icon name="truck-check" size={20} color="#059669" />}
              fullWidth
            />
          </AnimatedCard>
          <AnimatedCard delay={400} style={isMobile ? { width: '48%', marginBottom: 16 } : { flex: 1 }}>
            <StatCard 
              label="Total Procurement" 
              value={formatMoney(stats.totalSpent)} 
              indicatorText="Fulfilled supplies" 
              indicatorType="neutral" 
              colorScheme="purple"
              icon={<Ionicons name="wallet-outline" size={20} color="#7C3AED" />}
              fullWidth
            />
          </AnimatedCard>
        </View>

        {/* Search and Layout Controls */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Supplier Database</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">Manage material suppliers, purchase contracts, and delivery partners</Text>
          </View>

          <View className="flex-row items-center gap-3 w-full md:w-auto">
            <SearchInput items={suppliers} entityLabel="suppliers"
              placeholder="Search by name, company, email..."
              value={search}
              onChangeText={setSearch}
              className={isMobile ? "flex-1" : "w-80"}
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

            {!isMobile && (
              <View className="flex-row bg-gray-100 p-1 rounded-xl border border-gray-200">
                <Pressable
                  onPress={() => setViewMode('grid')}
                  className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Ionicons name="grid-outline" size={18} color={viewMode === 'grid' ? '#F97316' : '#6B7280'} />
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('table')}
                  className={`p-2 rounded-lg ${viewMode === 'table' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Ionicons name="list-outline" size={18} color={viewMode === 'table' ? '#F97316' : '#6B7280'} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Content Section */}
        {loading ? (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 py-24 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : filteredSuppliers.length === 0 ? (
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 py-24 items-center justify-center">
            <Ionicons name="people-outline" size={56} color="#D1D5DB" className="mb-4" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-lg font-semibold">No suppliers found</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm mt-1">Try adjusting your search criteria</Text>
          </View>
        ) : (viewMode === 'grid' || isMobile) ? (
          /* Colorful Supplier Boxes / Cards Grid */
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
            {filteredSuppliers.map((sup, idx) => (
              <View key={sup.id} style={isMobile ? { width: '100%', padding: 8 } : { width: '33.33%', padding: 8 }}>
                <View className="bg-white rounded-2xl border border-gray-200/90 hover:border-orange-200 p-5 shadow-sm hover:shadow-md transition-all flex-col justify-between h-full">
                  {/* Top Supplier Profile Row */}
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-row items-center flex-1 mr-2">
                      <RoleAvatar
                        size="md"
                        avatarUrl={sup.avatar_url}
                        role="supplier"
                        name={sup.full_name}
                        showRoleBadge
                        className="mr-3"
                      />
                      <View className="flex-1 min-w-0">
                        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-brand-text">
                          {sup.full_name || sup.company_name || 'Unnamed Supplier'}
                        </Text>
                        {sup.company_name && sup.company_name !== sup.full_name && (
                          <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 font-medium">
                            {sup.company_name}
                          </Text>
                        )}
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-400">
                          Partner since {format(new Date(sup.created_at || Date.now()), 'MMM yyyy')}
                        </Text>
                      </View>
                    </View>
                    <View className="bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-pink-700 font-bold text-[10px] uppercase">
                        {sup.supplier_type || 'Supplier'}
                      </Text>
                    </View>
                  </View>

                  {/* Contact Info */}
                  <View className="mb-4 pt-2 border-t border-gray-100 gap-1.5">
                    <View className="flex-row items-center">
                      <Ionicons name="mail-outline" size={14} color="#6B7280" />
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 ml-2">
                        {sup.email || 'No email provided'}
                      </Text>
                    </View>
                    {sup.contact_number && (
                      <View className="flex-row items-center">
                        <Ionicons name="call-outline" size={14} color="#6B7280" />
                        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-600 ml-2">
                          {sup.contact_number}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 3 Colorful Metric Boxes */}
                  <View className="flex-row gap-2 mb-4">
                    <View className="flex-1 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 items-center">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-amber-800">
                        {sup.activeOrders}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-amber-700 uppercase">
                        Active Orders
                      </Text>
                    </View>

                    <View className="flex-1 bg-blue-50 border border-blue-200/80 rounded-xl p-2.5 items-center">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-extrabold text-blue-800">
                        {sup.totalOrders}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-blue-700 uppercase">
                        Total Orders
                      </Text>
                    </View>

                    <View className="flex-1 bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 items-center">
                      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-extrabold text-emerald-800">
                        {formatMoney(sup.totalSpent || 0)}
                      </Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold text-emerald-700 uppercase">
                        Total Spent
                      </Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  <Pressable
                    onPress={() => router.push(`/admin/suppliers/${sup.id}` as any)}
                    style={{ minHeight: 40 }}
                    className="bg-brand-orange hover:bg-orange-600 active:bg-orange-700 rounded-xl py-2.5 px-4 flex-row items-center justify-center shadow-sm"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold mr-1.5">
                      View Supplier Profile
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color="white" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Enriched Colorful Table View */
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[30%] text-xs font-semibold text-gray-500 uppercase">Supplier Name</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Contact</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Active Orders</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase text-center">Total Orders</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[10%] text-xs font-semibold text-gray-500 uppercase text-right">Total Spent</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>

            {filteredSuppliers.map((sup) => (
              <View key={sup.id} className="flex-row items-center py-4 border-b border-gray-50 hover:bg-orange-50/20 transition-colors">
                <View className="w-[30%] pr-2 flex-row items-center">
                  <RoleAvatar
                    size="md"
                    avatarUrl={sup.avatar_url}
                    role="supplier"
                    name={sup.full_name}
                    showRoleBadge
                    className="mr-3 shrink-0"
                  />
                  <View className="min-w-0 flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{sup.full_name || 'Unnamed'}</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="bg-pink-50 border border-pink-200 px-1.5 py-0.2 rounded">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-pink-700 font-semibold text-[9px] uppercase">{sup.supplier_type || 'Supplier'}</Text>
                      </View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">Joined {format(new Date(sup.created_at), 'MMM yyyy')}</Text>
                    </View>
                  </View>
                </View>

                <View className="w-[20%] pr-2">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-xs truncate">{sup.email || 'No email'}</Text>
                  {sup.contact_number && (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[11px] truncate">{sup.contact_number}</Text>
                  )}
                </View>

                <View className="w-[15%] flex-row justify-center">
                  <View className={`px-2.5 py-1 rounded-full border ${sup.activeOrders > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-200'}`}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-bold ${sup.activeOrders > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
                      {sup.activeOrders} Active
                    </Text>
                  </View>
                </View>

                <View className="w-[15%] flex-row justify-center">
                  <View className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-blue-700">
                      {sup.totalOrders} Orders
                    </Text>
                  </View>
                </View>

                <View className="w-[10%]">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-emerald-700 font-bold text-right text-sm">
                    {formatMoney(sup.totalSpent || 0)}
                  </Text>
                </View>

                <View className="flex-1 flex-row justify-end pl-1">
                  <Pressable style={{ minHeight: 36, minWidth: 44 }}
                    onPress={() => router.push(`/admin/suppliers/${sup.id}` as any)}
                    className="bg-brand-orange hover:bg-orange-600 px-4 py-1.5 rounded-lg shadow-sm"
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Profile</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
