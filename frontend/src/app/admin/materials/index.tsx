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
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const { isMobile } = useResponsive();

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) return;

        const [materialsReq, ordersReq, projectsReq] = await Promise.all([
          supabase.from('materials').select('global_stock_quantity, low_stock_threshold, unit_price'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['Pending Delivery', 'Confirmed']),
          supabase.from('projects').select('id, name').eq('status', 'active').order('name')
        ]);

        let totalMaterials = 0;
        let lowStockAlerts = 0;
        let totalValue = 0;

        if (materialsReq.data) {
          totalMaterials = materialsReq.data.length;
          lowStockAlerts = materialsReq.data.filter(m => (m.global_stock_quantity || 0) < (m.low_stock_threshold || 1)).length;
          totalValue = materialsReq.data.reduce((sum, m) => sum + ((m.global_stock_quantity || 0) * (m.unit_price || 0)), 0);
        }

        if (isMounted) {
          setStats({
            totalMaterials,
            pendingDeliveries: ordersReq.count || 0,
            lowStockAlerts,
            totalValue,
          });
          if (projectsReq.data) {
            setProjects(projectsReq.data);
          }
        }
      } catch (error) {
        console.warn('Failed to load material stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();

    const chan1 = supabase.channel('admin-materials')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, loadStats)
      .subscribe();
    
    const chan2 = supabase.channel('admin-po')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, loadStats)
      .subscribe();

    return () => { 
      isMounted = false; 
      supabase.removeChannel(chan1);
      supabase.removeChannel(chan2);
    };
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
          
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: 12 }}>
            <Text className="text-2xl font-bold text-brand-text">All Materials</Text>
            
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, width: isMobile ? '100%' : 'auto', zIndex: 50 }}>
              {/* Project Filter */}
              <View className="relative w-full" style={!isMobile ? { width: 220 } : {}}>
                <Pressable 
                  onPress={() => setShowProjectDrop(!showProjectDrop)}
                  className="flex-row justify-between items-center bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm h-10"
                >
                  <Text className={selectedProjectId ? "text-brand-text text-sm" : "text-gray-400 text-sm"} numberOfLines={1}>
                    {selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name : 'All Projects'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </Pressable>
                
                {showProjectDrop && (
                  <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-[60]">
                    <ScrollView nestedScrollEnabled={true}>
                      <Pressable 
                        onPress={() => { setSelectedProjectId(''); setShowProjectDrop(false); }}
                        className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                      >
                        <Text className="text-gray-800 font-bold">All Projects</Text>
                      </Pressable>
                      {projects.map(proj => (
                        <Pressable 
                          key={proj.id} 
                          onPress={() => { setSelectedProjectId(proj.id); setShowProjectDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800 text-sm">{proj.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Search */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, height: 40, width: isMobile ? '100%' : 220, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
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
              indicatorText={stats.lowStockAlerts > 0 ? "Requires ordering" : "All stock healthy"} 
              indicatorType={stats.lowStockAlerts > 0 ? "warning" : "success"} 
              icon={<Ionicons name={stats.lowStockAlerts > 0 ? "warning" : "checkmark-circle"} size={16} color={stats.lowStockAlerts > 0 ? "#F97316" : "#22C55E"} />}
            />
            <StatCard 
              label="Pending Deliveries" 
              value={stats.pendingDeliveries.toString()}
              indicatorText="Arriving soon" 
            />
            <StatCard 
              label="Total Inventory Value" 
              value={`Rs. ${(stats.totalValue / 1000000).toFixed(1)}M`}
              indicatorText="Value across all sites" 
              indicatorType="neutral" 
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
            <View style={isMobile ? { width: '100%', zIndex: 10 } : { flex: 2, marginRight: 24, zIndex: 10 }}>
              <InventoryTable refreshTrigger={refreshTrigger} searchQuery={searchQuery} projectId={selectedProjectId} />
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
