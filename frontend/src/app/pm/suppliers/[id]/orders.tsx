import { RecordCard } from '@/components/common/RecordCard';
import { useResponsive } from '@/hooks/useResponsive';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

const formatCurrency = (amount: number | null | undefined) => amount == null || !Number.isFinite(Number(amount)) ? 'Not recorded' : `Rs. ${Number(amount).toLocaleString('en-LK')}`;
const formatDate = (dateString?: string | null) => dateString ? new Date(dateString).toLocaleDateString('en-GB') : 'Not set';

import { StatusBadge } from '@/components/common/StatusBadge';
import { OrderActionButton } from '@/components/common/OrderActionButton';

export default function PMSupplierOrdersPage() {
  const { isMobile } = useResponsive();
  const router = useRouter();
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
        const [profileRes, ordersRes, materialsRes] = await Promise.all([
          supabase.from('profiles').select('full_name, company_name').eq('id', id).single(),
          supabase.auth.getSession().then(({ data }) => 
            supabase.from('purchase_orders')
              .select('id, po_number, material_id, quantity_ordered, total_price, status, expected_date, created_at, items, projects!inner(name, pm_id)')
              .eq('supplier_id', id)
              .eq('projects.pm_id', data.session?.user.id)
              .order('created_at', { ascending: false })
          ),
          supabase.from('materials').select('id, name, unit')
        ]);

        if (profileRes.error) throw profileRes.error;
        if (ordersRes.error) throw ordersRes.error;
        
        const materialsList = materialsRes?.data || [];
        const mergedOrders = (ordersRes.data || []).map(order => {
          const mat: any = materialsList.find(m => m.id === order.material_id) || {};
          return {
            ...order,
            quantity: order.quantity_ordered,
            expected_delivery: order.expected_date,
            items: order.items,
            materials: {
              name: mat.name,
              unit: mat.unit
            }
          };
        });

        if (isMounted) {
          setSupplierName(profileRes.data?.company_name || profileRes.data?.full_name || 'Supplier');
          setOrders(mergedOrders as PurchaseOrder[]);
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

  const handleAction = async (orderId: string, action: 'approve' | 'reject' | 'deliver', poName: string) => {
    const isReject = action === 'reject';
    const confirmMessage = isReject ? `Reject ${poName}?` : `Are you sure you want to ${action} this order?`;
    
    const executeAction = async () => {
      setActionLoading(orderId);
      try {
        if (action === 'approve') await api.purchaseOrders.approve(orderId, {});
        else if (action === 'reject') await api.purchaseOrders.reject(orderId);
        else if (action === 'deliver') await api.purchaseOrders.deliver(orderId);
        
        setRefreshTrigger(v => v + 1);
        const msg = action === 'deliver' ? 'Order marked as delivered successfully' : `Order ${action}d successfully`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Success', msg);
      } catch (err: any) {
        setRefreshTrigger(v => v + 1); // Refresh anyway
        const msg = err.message || `Failed to ${action} order.`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
      } finally {
        setActionLoading(null);
      }
    };

    if (isReject) {
      Alert.alert('Confirm Reject', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', onPress: executeAction, style: 'destructive' }
      ]);
    } else {
      executeAction();
    }
  };

  if (isMobile && !loading && !error && orders.length) return <View className="flex-1 bg-brand-light"><TopNav title="Supplier Orders" showAction={false} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>{orders.map(order => <RecordCard key={order.id} title={order.materials?.name || 'Material order'} fields={[{ label: 'Quantity', value: `${order.quantity} ${order.materials?.unit || ''}` }, { label: 'Total', value: formatCurrency(order.total_price) }, { label: 'Status', value: order.status }, { label: 'Expected', value: formatDate(order.expected_delivery) }]} action={{ label: 'View order', onPress: () => router.push(`/pm/materials/orders/${order.id}` as any) }} />)}</ScrollView></View>;
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title={`${supplierName} Orders`} showAction={false} />
      
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-danger text-center mb-4">{error}</Text>
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRefreshTrigger(t => t + 1)} className="bg-brand-orange px-6 py-3 rounded-lg">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-semibold">Retry</Text>
          </Pressable>
        </View>
      ) : orders.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="folder-open-outline" size={48} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted mt-3 text-center">No orders found for this supplier</Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 800 }} className="w-full">
              {/* Table Header */}
              <View className="flex-row items-center bg-gray-50 border-b border-gray-200 py-3 px-4 rounded-t-lg">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[0.8] text-xs font-semibold text-gray-500 uppercase">PO / Project</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[1.5] text-xs font-semibold text-gray-500 uppercase">Material</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[0.8] text-xs font-semibold text-gray-500 uppercase">Quantity</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[1] text-xs font-semibold text-gray-500 uppercase">Total Amount</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[0.8] text-xs font-semibold text-gray-500 uppercase">Expected</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[1] text-xs font-semibold text-gray-500 uppercase">Status</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[180px] text-xs font-semibold text-gray-500 uppercase text-right">Actions</Text>
              </View>

              {/* Table Rows */}
              {orders.map((order: any) => {
                const matName = order.materials?.name || order.items || 'Unknown Material';
                const matUnit = order.materials?.unit || '';
                const poName = order.po_number || 'Order';
                const hasPrice = order.total_price != null && Number.isFinite(Number(order.total_price));
                
                return (
                  <View key={order.id} className="flex-row items-center border-b border-gray-100 py-4 px-4 bg-white">
                    <View className="flex-[0.8] pr-2">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-brand-text mb-1" numberOfLines={1}>{poName}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500" numberOfLines={1}>{order.projects?.name || 'No Project'}</Text>
                    </View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[1.5] text-sm text-brand-text font-medium pr-2">{matName}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-[0.8] text-sm text-gray-600 pr-2">{order.quantity} {matUnit}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`flex-[1] text-sm font-semibold pr-2 ${hasPrice ? 'text-brand-text' : 'text-gray-400'}`}>
                      {hasPrice ? formatCurrency(order.total_price) : 'Awaiting supplier price'}
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`flex-[0.8] text-sm pr-2 ${order.expected_delivery ? 'text-gray-600' : 'text-gray-400'}`}>
                      {order.expected_delivery ? formatDate(order.expected_delivery) : '—'}
                    </Text>
                    <View className="flex-[1] items-start"><StatusBadge status={order.status} /></View>
                    <View className="w-[180px] flex-row justify-end items-center gap-2 pl-2">
                      {(order.status === 'Pending Delivery' || order.status === 'Suggested') && (
                        <>
                          <OrderActionButton type="approve" loading={actionLoading === order.id} onPress={() => handleAction(order.id, 'approve', poName)} />
                          <OrderActionButton type="reject" loading={actionLoading === order.id} onPress={() => handleAction(order.id, 'reject', poName)} />
                        </>
                      )}
                      {order.status === 'Confirmed' && (
                        <OrderActionButton type="deliver" loading={actionLoading === order.id} onPress={() => handleAction(order.id, 'deliver', poName)} />
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
