import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../../components/common/StatCard';
import { InventoryTable } from '../../../components/materials/InventoryTable';
import { LowStockAlerts } from '../../../components/materials/LowStockAlerts';
import { PendingOrders } from '../../../components/materials/PendingOrders';
import { PendingDeliveries } from '../../../components/materials/PendingDeliveries';
import { RecentDeliveries } from '../../../components/materials/RecentDeliveries';
import { NewMaterialModal } from '../../../components/materials/NewMaterialModal';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useTableRealtime } from '@/hooks/useTableRealtime';
import { SearchInput } from '@/components/common/SearchInput';
import { Toolbar, ToolbarSearch, ToolbarFilter, Select } from '@/components/ui';

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
  const { tick } = useTableRealtime(['materials']);
  const [searchMaterials, setSearchMaterials] = useState<any[]>([]);
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
          supabase.from('materials').select('id, name, category, project_id, current_stock, minimum_threshold, unit_price'),
          supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['Pending Delivery', 'Confirmed']),
          supabase.from('projects').select('id, name').eq('status', 'active').order('name')
        ]);

        let totalMaterials = 0;
        let lowStockAlerts = 0;
        let totalValue = 0;

        if (materialsReq.data) {
          totalMaterials = materialsReq.data.length;
          lowStockAlerts = materialsReq.data.filter(m => (m.current_stock || 0) < (m.minimum_threshold || 1)).length;
          totalValue = materialsReq.data.reduce((sum, m) => sum + ((m.current_stock || 0) * (m.unit_price || 0)), 0);
        }

        if (isMounted) {
          setSearchMaterials(materialsReq.data || []);
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
  }, [refreshTrigger, tick]);

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
        <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${isMobile ? 'px-4 py-4' : 'p-6'}`} showsVerticalScrollIndicator={false}>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-4 md:mb-0">All Materials</Text>

            <Toolbar>
              <ToolbarSearch>
                <SearchInput entityLabel="materials" items={searchMaterials.filter(m => !selectedProjectId || m.project_id === selectedProjectId)}
                  placeholder="Search materials..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="w-full"
                  config={{
                    table: 'materials',
                    searchColumn: 'name',
                    secondaryColumn: 'category',
                    titleColumn: 'name',
                    subtitleColumn: 'category'
                  }}
                />
              </ToolbarSearch>
              <ToolbarFilter>
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  options={[
                    { value: '', label: 'All Projects' },
                    ...projects.map(p => ({ value: p.id, label: p.name }))
                  ]}
                  placeholder="All Projects"
                />
              </ToolbarFilter>
            </Toolbar>
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
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/materials/orders')} className="bg-emerald-50 px-4 py-3 rounded-lg border border-emerald-100 flex-row items-center">
              <Ionicons name="cart-outline" size={20} color="#10B981" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-emerald-700 font-bold ml-2">All Purchase Orders</Text>
            </Pressable>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/admin/materials/stock')} className="bg-blue-50 px-4 py-3 rounded-lg border border-blue-100 flex-row items-center">
              <Ionicons name="cube-outline" size={20} color="#3B82F6" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 font-bold ml-2">Site Stock Levels</Text>
            </Pressable>
          </View>

          {/* Main Content Layout */}
          <View style={isMobile ? { flexDirection: 'column', gap: 16 } : { flexDirection: 'row' }}>
            {/* Main Content Area (Inventory Table) */}
            <View style={isMobile ? { width: '100%', zIndex: 10 } : { flex: 2, marginRight: 24, zIndex: 10 }}>
              <InventoryTable refreshTrigger={refreshTrigger + tick} searchQuery={searchQuery} projectId={selectedProjectId} />
            </View>

            {/* Side Panel (Alerts & Deliveries) */}
            <View style={isMobile ? { width: '100%', gap: 16 } : { flex: 1 }}>
              <LowStockAlerts refreshTrigger={refreshTrigger} />
              <PendingDeliveries refreshTrigger={refreshTrigger} />
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
