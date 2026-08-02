import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { SupplierOrdersTable } from '../../components/supplier/SupplierOrdersTable';
import { SupplierAlertsPanel } from '../../components/supplier/SupplierAlertsPanel';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function SupplierDashboardScreen() {
  const [stats, setStats] = useState({
    pendingOrders: 0,
    confirmedOrders: 0,
    lateDeliveries: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        // Fetch supplier orders (omitting strict supplier_id filter for demo visibility)
        const today = new Date().toISOString().split('T')[0];
        
        const [pendingReq, confirmedReq, lateReq, allOrdersReq] = await Promise.all([
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending Delivery'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'Confirmed'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['Pending Delivery', 'Confirmed']).lt('expected_date', today),
          supabase.from('purchase_orders').select('total_price').neq('status', 'Cancelled')
        ]);

        let totalRevenue = 0;
        if (allOrdersReq.data) {
          totalRevenue = allOrdersReq.data.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
        }

        if (isMounted) {
          setStats({
            pendingOrders: pendingReq.count || 0,
            confirmedOrders: confirmedReq.count || 0,
            lateDeliveries: lateReq.count || 0,
            totalRevenue: totalRevenue,
          });
        }
      } catch (error) {
        console.warn('Failed to load supplier dashboard stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleOrderAction = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Supplier Dashboard" 
        actionLabel="Refresh" 
        onActionPress={() => setRefreshTrigger(prev => prev + 1)} 
        initialSearchQuery={searchQuery}
        onSearch={setSearchQuery}
      />
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {/* Top Stat Cards Row */}
          <View className="flex-row justify-between mb-6 -mx-2">
            <AnimatedCard delay={100} style={{ flex: 1 }}>
              <StatCard 
                label="New Orders" 
                value={stats.pendingOrders.toString()} 
                indicatorText="Requires approval" 
                indicatorType="warning" 
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={{ flex: 1 }}>
              <StatCard 
                label="In Transit" 
                value={stats.confirmedOrders.toString()} 
                indicatorText="Approved orders" 
                indicatorType="success"
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={{ flex: 1 }}>
              <StatCard 
                label="Late Deliveries" 
                value={stats.lateDeliveries.toString()} 
                indicatorText="Overdue items" 
                indicatorType={stats.lateDeliveries > 0 ? "danger" : "success"} 
                icon={<Ionicons name={stats.lateDeliveries > 0 ? "warning" : "checkmark-circle"} size={16} color={stats.lateDeliveries > 0 ? "#EF4444" : "#10B981"} />}
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={{ flex: 1 }}>
              <StatCard 
                label="Total Revenue" 
                value={formatCurrency(stats.totalRevenue)} 
                indicatorText="Lifetime orders" 
              />
            </AnimatedCard>
          </View>

          {/* Center Row: Orders & Alerts */}
          <View className="flex-row mb-6">
            {/* Main Content Area (Orders) */}
            <View className="flex-[2] mr-6">
              <SupplierOrdersTable refreshTrigger={refreshTrigger} onOrderAction={handleOrderAction} />
            </View>
            
            {/* Side Panel (Late Alerts) */}
            <View className="flex-[1]">
              <SupplierAlertsPanel refreshTrigger={refreshTrigger} />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
