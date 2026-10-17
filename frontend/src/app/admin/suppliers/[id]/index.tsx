import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon } from '@/components/ui/Icon';
import { format } from 'date-fns';
import { formatMoney } from '@/utils/format';
import { RoleAvatar } from '@/components/common/RoleAvatar';
import { StatCard } from '@/components/common/StatCard';
import { AnimatedCard } from '@/components/common/AnimatedCard';
import { useResponsive } from '@/hooks/useResponsive';

export default function SupplierDetailPage() {
  const { id } = useLocalSearchParams();
  const supplierId = Array.isArray(id) ? id[0] : (id || '');
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [supplier, setSupplier] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!supplierId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data: sup, error: supErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', supplierId)
          .single();
          
        if (supErr) {
          if (supErr.code === 'PGRST116') {
             if (isMounted) setSupplier(null);
          } else {
             throw supErr;
          }
        } else {
           if (isMounted) setSupplier(sup);
        }
        
        const { data: ords, error: ordErr } = await supabase
          .from('purchase_orders')
          .select('*, projects(name)')
          .eq('supplier_id', supplierId)
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
      <View className="flex-1 bg-gray-50">
        <TopNav title="Supplier Details" actionLabel="Back" onActionPress={() => router.back()} />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View className="flex-1 bg-gray-50">
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
      <View className="flex-1 bg-gray-50">
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
  const totalSpent = orders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.total_price || 0), 0);
  const recentOrders = orders.slice(0, 5);

  const getOrderStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'delivered') return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' };
    if (s.includes('pending') || s.includes('confirmed') || s.includes('suggested')) return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' };
    if (s.includes('counter') || s.includes('reject') || s.includes('cancel')) return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' };
    return { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-600' };
  };

  return (
    <View className="flex-1 bg-gray-50">
      <TopNav title={supplier.full_name || 'Supplier'} actionLabel="Back" onActionPress={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        
        {/* Contact Details Card */}
        <View className="bg-white rounded-2xl p-6 mb-5 shadow-sm border border-gray-200/90">
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-row items-center flex-1 mr-3">
              <RoleAvatar
                size="lg"
                avatarUrl={supplier.avatar_url}
                role="supplier"
                name={supplier.full_name}
                showRoleBadge
                className="mr-4"
              />
              <View className="flex-1 min-w-0">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">
                  {supplier.full_name || supplier.company_name}
                </Text>
                {supplier.company_name && supplier.company_name !== supplier.full_name && (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-medium text-gray-500 mt-0.5">
                    {supplier.company_name}
                  </Text>
                )}
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400 mt-0.5">
                  {supplier.email}
                </Text>
              </View>
            </View>
            <View className="bg-pink-50 border border-pink-200 px-3 py-1 rounded-full">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-pink-700 font-bold text-xs uppercase">
                {supplier.supplier_type || 'Supplier Partner'}
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-y-2 gap-x-6 pt-3 border-t border-gray-100">
            {supplier.contact_number && (
              <View className="flex-row items-center">
                <Ionicons name="call-outline" size={15} color="#6B7280" className="mr-1.5" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs font-medium">
                  {supplier.contact_number}
                </Text>
              </View>
            )}
            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={15} color="#6B7280" className="mr-1.5" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs">
                Joined {format(new Date(supplier.created_at || Date.now()), 'MMM d, yyyy')}
              </Text>
            </View>
          </View>
        </View>

        {/* Colorful Stat Cards Row */}
        <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <AnimatedCard delay={100} style={isMobile ? { width: '48%', marginBottom: 12 } : { flex: 1 }}>
            <StatCard 
              label="Active Orders" 
              value={activeOrders.toString()} 
              indicatorText={activeOrders > 0 ? "Pending fulfillment" : "All orders fulfilled"} 
              indicatorType={activeOrders > 0 ? "warning" : "success"}
              colorScheme="amber"
              icon={<Ionicons name="cart" size={18} color="#D97706" />}
              fullWidth
            />
          </AnimatedCard>
          <AnimatedCard delay={200} style={isMobile ? { width: '48%', marginBottom: 12 } : { flex: 1 }}>
            <StatCard 
              label="Delivered" 
              value={deliveredOrders.toString()} 
              indicatorText="Fulfilled orders" 
              indicatorType="success" 
              colorScheme="emerald"
              icon={<Icon name="truck-check" size={18} color="#059669" />}
              fullWidth
            />
          </AnimatedCard>
          <AnimatedCard delay={300} style={isMobile ? { width: '100%', marginBottom: 12 } : { flex: 1 }}>
            <StatCard 
              label="Total Spent" 
              value={formatMoney(totalSpent)} 
              indicatorText="Delivered materials" 
              indicatorType="neutral" 
              colorScheme="purple"
              icon={<Ionicons name="wallet-outline" size={18} color="#7C3AED" />}
              fullWidth
            />
          </AnimatedCard>
        </View>

        <Pressable 
          style={{ minHeight: 44 }}
          onPress={() => router.push(`/admin/suppliers/${id}/orders`)}
          className="bg-brand-orange hover:bg-orange-600 active:bg-orange-700 rounded-xl p-4 items-center justify-center mb-6 shadow-sm flex-row"
        >
          <Icon name="truck-delivery" size={20} color="white" className="mr-2" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Manage All Purchase Orders</Text>
        </Pressable>

        {/* Recent Orders */}
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-4 px-1">Recent Orders</Text>
        {recentOrders.length === 0 ? (
          <View className="bg-white rounded-2xl p-8 items-center shadow-sm border border-gray-200/90">
            <Icon name="file-document-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-2 font-medium">No purchase orders found for this supplier.</Text>
          </View>
        ) : (
          recentOrders.map(order => {
            const badge = getOrderStatusBadge(order.status);
            return (
              <Pressable
                key={order.id}
                style={{ minHeight: 60 }}
                onPress={() => router.push(`/admin/suppliers/${id}/orders`)}
                className="bg-white rounded-2xl p-5 mb-3 shadow-sm border border-gray-200/90 hover:border-orange-200 flex-row justify-between items-center transition-colors"
              >
                <View className="flex-1 pr-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-900 text-base mb-1" numberOfLines={1}>
                    {order.po_number || order.items || 'Order'}
                  </Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{order.projects?.name || 'Unknown Project'}</Text>
                </View>
                <View className="items-end gap-1.5">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-orange text-base">
                    {order.total_price && order.total_price > 0 ? formatMoney(order.total_price) : 'Pending Price'}
                  </Text>
                  <View className={`px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[11px] font-bold ${badge.text}`}>{order.status}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}
