import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../../components/common/StatCard';
import { InventoryTable } from '../../../components/materials/InventoryTable';
import { LowStockAlerts } from '../../../components/materials/LowStockAlerts';
import { PendingOrders } from '../../../components/materials/PendingOrders';
import { RecentDeliveries } from '../../../components/materials/RecentDeliveries';
import { NewMaterialModal } from '../../../components/materials/NewMaterialModal';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

import { useResponsive } from '../../../hooks/useResponsive';

export default function MaterialsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalMaterials: 0,
    pendingDeliveries: 0,
    lowStockAlerts: 0,
    totalValue: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const { isMobile } = useResponsive();

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        const [materialsReq, ordersReq] = await Promise.all([
          supabase.from('materials').select('global_stock_quantity, low_stock_threshold, unit_price'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending Delivery')
        ]);

        let totalMaterials = 0;
        let lowStockAlerts = 0;
        let totalValue = 0;

        if (materialsReq.data) {
          totalMaterials = materialsReq.data.length;
          lowStockAlerts = materialsReq.data.filter(m => (m.global_stock_quantity || 0) < (m.low_stock_threshold || 0)).length;
          totalValue = materialsReq.data.reduce((sum, m) => sum + ((m.global_stock_quantity || 0) * (m.unit_price || 0)), 0);
        }

        if (isMounted) {
          setStats({
            totalMaterials,
            pendingDeliveries: ordersReq.count || 0,
            lowStockAlerts,
            totalValue,
          });
        }
      } catch (error) {
        console.warn('Failed to load material stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleOrderCreated = () => {
    setModalVisible(false);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Materials" 
        actionLabel="+ New Order" 
        onActionPress={() => router.push('/admin/materials/orders/create')} 
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>
          
          <View style={{ flexDirection: 'column', marginBottom: 24, gap: 12 }}>
            <Text className="text-2xl font-bold text-brand-text">All Materials</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: isMobile ? '100%' : 256, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput 
                className="flex-1 ml-2 text-sm text-brand-text outline-none"
                placeholder="Search materials..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Top Stat Cards Row */}
          <View style={isMobile ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 } : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -8 }}>
            <StatCard 
              label="Total Materials" 
              value={stats.totalMaterials.toString()} 
              indicatorText={`Items in inventory`} 
            />
            <StatCard 
              label="Low Stock Alerts" 
              value={stats.lowStockAlerts.toString()} 
              indicatorText="Requires ordering" 
              indicatorType={stats.lowStockAlerts > 0 ? "warning" : "success"} 
              icon={<Ionicons name={stats.lowStockAlerts > 0 ? "warning" : "checkmark-circle"} size={16} color={stats.lowStockAlerts > 0 ? "#F97316" : "#22C55E"} />}
            />
            <StatCard 
              label="Pending Deliveries" 
              value={stats.pendingDeliveries.toString()}
              indicatorText="Arriving this week" 
            />
            <StatCard 
              label="Total Inventory Value" 
              value={`Rs. ${(stats.totalValue / 1000000).toFixed(1)}M`}
              indicatorText="+8% this month" 
              indicatorType="success" 
            />
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24 }}>
            <Pressable onPress={() => router.push('/admin/materials/orders')} className="bg-emerald-50 px-4 py-3 rounded-lg border border-emerald-100 flex-row items-center">
              <Ionicons name="cart-outline" size={20} color="#10B981" />
              <Text className="text-emerald-700 font-bold ml-2">All Purchase Orders</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/admin/materials/stock')} className="bg-blue-50 px-4 py-3 rounded-lg border border-blue-100 flex-row items-center">
              <Ionicons name="cube-outline" size={20} color="#3B82F6" />
              <Text className="text-blue-700 font-bold ml-2">Site Stock Levels</Text>
            </Pressable>
          </View>

          {/* Main Content Layout */}
          <View style={isMobile ? { flexDirection: 'column', gap: 16 } : { flexDirection: 'row' }}>
            {/* Main Content Area (Inventory Table) */}
            <View style={isMobile ? { width: '100%' } : { flex: 2, marginRight: 24 }}>
              <InventoryTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
            </View>
            
            {/* Side Panel (Alerts & Deliveries) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1 }}>
              <LowStockAlerts refreshTrigger={refreshTrigger} />
              <PendingOrders refreshTrigger={refreshTrigger} onRefreshNeeded={() => setRefreshTrigger(p=>p+1)} />
              <RecentDeliveries refreshTrigger={refreshTrigger} />
            </View>
          </View>
        </ScrollView>
      )}

      <NewMaterialModal 
        visible={isModalVisible} 
        onClose={() => setModalVisible(false)} 
        onSuccess={handleOrderCreated} 
      />
    </View>
  );
}
