import type { ScrollView as ScrollViewHandle } from 'react-native';
import { DashboardDetailLink } from '@/components/dashboard/DashboardDetailLink';
import { DashboardContent, DashboardHero, DashboardActions, DashboardSectionHeading } from '@/components/dashboard/DashboardLayout';
// Modified for Expo Go mobile compatibility
// Modified for Expo Go mobile compatibility
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { StatCard } from '../../components/common/StatCard';
import { AnimatedCard } from '../../components/common/AnimatedCard';
import { SearchInput } from '../../components/common/SearchInput';
import { SupplierOrdersTable } from '../../components/supplier/SupplierOrdersTable';
import { SupplierAlertsPanel } from '../../components/supplier/SupplierAlertsPanel';
import { SupplierPendingDeliveries } from '../../components/supplier/SupplierPendingDeliveries';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useResponsive } from '../../hooks/useResponsive';
import { useSupplierOrders, deriveSupplierStats, matchesSupplierSearch, buildOrderSuggestions, PO_STATUS } from '../../hooks/useSupplierOrders';

const OPEN_STATUSES: string[] = [PO_STATUS.PENDING, PO_STATUS.SUGGESTED, PO_STATUS.CONFIRMED, PO_STATUS.DELIVERED];
const DONE_STATUSES: string[] = [PO_STATUS.DELIVERED, PO_STATUS.RECEIVED];

export default function SupplierDashboardScreen() {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const inboxScroll = useRef<ScrollViewHandle>(null);
  const inboxY = useRef(0);
  // Single realtime source for every widget on this screen.
  const { orders, projects, stats: globalStats, loading, lastUpdated, refresh } = useSupplierOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const stats = {
    pendingOrders: globalStats.newOrders.length,
    confirmedOrders: globalStats.pendingDeliveries.length,
    lateDeliveries: globalStats.late.length,
    totalRevenue: globalStats.totalRevenue,
  };

  // Panels respect the project chip + search box; stat cards always show the full picture.
  const panelStats = useMemo(() => {
    const scoped = orders.filter(o =>
      (!selectedProjectId || o.project_id === selectedProjectId) && matchesSupplierSearch(o, searchQuery)
    );
    return deriveSupplierStats(scoped);
  }, [orders, selectedProjectId, searchQuery]);

  const assignedProjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; location: string }>();
    projects.forEach(p => map.set(p.id, p));
    // Include projects the supplier has orders for even if no explicit role assignment exists.
    orders.forEach(o => {
      if (o.project_id && !map.has(o.project_id)) {
        map.set(o.project_id, { id: o.project_id, name: o.project_name, location: (o as any).project_location || '' });
      }
    });
    return Array.from(map.values()).map(p => {
      const pOrders = orders.filter(o => o.project_id === p.id);
      const delivered = pOrders.filter(o => DONE_STATUSES.includes(o.status));
      const last = delivered.length > 0
        ? new Date(Math.max(...delivered.map(o => new Date(o.updated_at || o.created_at).getTime())))
        : null;
      return {
        ...p,
        openCount: pOrders.filter(o => OPEN_STATUSES.includes(o.status)).length,
        lastDelivery: last ? last.toDateString() : 'Never',
      };
    });
  }, [projects, orders]);

  const getSuggestions = useCallback((q: string) => buildOrderSuggestions(orders, q), [orders]);


  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="flex-1 bg-brand-light dark:bg-slate-950">
      <TopNav
        title="Supplier Dashboard"
        showAction={false}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <DashboardContent scrollRef={inboxScroll}>
          <DashboardHero eyebrow="Supplier workspace" title="Orders & deliveries" description="Purchase orders awaiting review and upcoming deliveries." icon="cube-outline" />

          {/* Header row with Title and Search */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-slate-900 dark:text-white">Order overview</Text>
              <View className="flex-row flex-wrap items-center mt-1 gap-2">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">
                  Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
                </Text>
                {searchQuery.trim() !== '' && (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-brand-orange ml-3">Filtered by &quot;{searchQuery}&quot;</Text>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Refresh supplier dashboard" onPress={refresh} className="min-w-[44px] min-h-[44px] items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><Ionicons name="refresh-outline" size={17} color="#64748b" /></Pressable>
              </View>
            </View>

            <SearchInput
              placeholder="Search orders, PO, material..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className={isMobile ? "w-full" : "w-80"}
              getLocalResults={getSuggestions}
              onSelectResult={(item) => router.push(`/supplier/orders/${item.id}` as any)}
            />
          </View>

          {/* Top Stat Cards Row */}
          <View className="flex-row flex-wrap mb-6" style={{ gap:isMobile ? 0 : 16, justifyContent:isMobile ? 'space-between' : undefined }}>
            <AnimatedCard delay={100} style={isMobile ? { width: '48%', minWidth: 0, marginBottom: 12 } : { flex: 1, minWidth: 0 }}>
              <StatCard onPress={() => router.push('/supplier/orders' as Href)}
                label="New Orders"
                value={stats.pendingOrders.toString()}
                indicatorText="Requires approval"
                indicatorType="warning"
                fullWidth
                colorScheme="blue"
              />
            </AnimatedCard>
            <AnimatedCard delay={200} style={isMobile ? { width: '48%', minWidth: 0, marginBottom: 12 } : { flex: 1, minWidth: 0 }}>
              <StatCard onPress={() => router.push('/supplier/deliveries')} 
                label="In Transit"
                value={stats.confirmedOrders.toString()}
                indicatorText="Confirmed, awaiting dispatch"
                indicatorType="success"
                fullWidth
                colorScheme="emerald"
              />
            </AnimatedCard>
            <AnimatedCard delay={300} style={isMobile ? { width: '48%', minWidth: 0, marginBottom: 12 } : { flex: 1, minWidth: 0 }}>
              <StatCard onPress={() => router.push('/supplier/deliveries')} 
                label="Late Deliveries"
                value={stats.lateDeliveries.toString()}
                indicatorText="Overdue items"
                indicatorType={stats.lateDeliveries > 0 ? "danger" : "success"}
                fullWidth
                colorScheme="rose"
              />
            </AnimatedCard>
            <AnimatedCard delay={400} style={isMobile ? { width: '48%', minWidth: 0, marginBottom: 12 } : { flex: 1, minWidth: 0 }}>
              <StatCard onPress={() => router.push('/supplier/orders/history')} 
                label="Total Revenue"
                value={formatCurrency(stats.totalRevenue)}
                indicatorText="Confirmed, delivered & received"
                fullWidth
                colorScheme="purple"
              />
            </AnimatedCard>
          </View>

          <DashboardActions actions={[
            { label:'Order inbox', description:'Review and respond to orders', icon:'receipt-outline', onPress:()=>{ setSelectedProjectId(null); setSearchQuery(''); inboxScroll.current?.scrollTo({ y:inboxY.current, animated:true }); } },
            { label:'Deliveries', description:'Plan your upcoming dispatches', icon:'car-outline', onPress:()=>router.push('/supplier/deliveries') },
            { label:'Messages', description:'Coordinate with project teams', icon:'chatbubbles-outline', onPress:()=>router.push('/supplier/messages') },
          ]} />
          {/* Assigned Projects Section */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1 min-w-0"><DashboardSectionHeading title="Projects you supply" description="Select a project to focus your order inbox." icon="business-outline" /></View>
              {selectedProjectId && (
                 <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setSelectedProjectId(null)}>
                   <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">Clear Filter</Text>
                 </Pressable>
              )}
            </View>

            {assignedProjects.length === 0 ? (
              <View className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 p-8 items-center justify-center">
                <Ionicons name="business-outline" size={48} color="#D1D5DB" className="mb-4" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-medium">Not currently assigned to any projects.</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap -mx-2">
                {assignedProjects.map(proj => (
                  <View key={proj.id} style={{ width: isMobile ? '100%' : '33.333%', paddingHorizontal: 8, marginBottom: 16, minWidth: 0 }}>
                    <Pressable
                      onPress={() => setSelectedProjectId(proj.id === selectedProjectId ? null : proj.id)}
                      className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border p-5 ${proj.id === selectedProjectId ? 'border-brand-orange bg-orange-50' : 'border-gray-100'}`}
                      style={{ minHeight: 176, minWidth: 0 }}
                      accessibilityRole="button" accessibilityState={{ selected:proj.id===selectedProjectId }} accessibilityLabel={"Filter orders for "+proj.name}
                    >
                      <View className="flex-row items-start mb-3">
                        <View className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${proj.id === selectedProjectId ? 'bg-orange-100' : 'bg-blue-50'}`}>
                          <Ionicons name="construct" size={16} color={proj.id === selectedProjectId ? "#F97316" : "#3B82F6"} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-800">{proj.name}</Text>
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-400">{proj.location}</Text>
                        </View>
                      </View>
                      <View className="flex-row justify-between mb-1">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500">Open Orders:</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-bold text-gray-800">{proj.openCount}</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500">Last Delivery:</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-medium text-gray-800">{proj.lastDelivery}</Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Center Row: Orders & Alerts */}
          <View onLayout={event => { inboxY.current = event.nativeEvent.layout.y; }} className={isMobile ? "flex-col gap-6 mb-6" : "flex-row gap-6 mb-6"}>
            {/* Main Content Area (Orders) */}
            <View className={isMobile ? "w-full" : "flex-[2] min-w-0"}>
              <DashboardDetailLink href="/supplier/orders" label="order register" interactive><SupplierOrdersTable
                orders={panelStats.incoming}
                onOpenOrder={(id) => router.push(`/supplier/orders/${id}` as any)}
              /></DashboardDetailLink>
            </View>

            {/* Side Panel (Late Alerts & Deliveries) */}
            <View className={isMobile ? "w-full" : "flex-[1] min-w-0"}>
              <DashboardDetailLink href="/supplier/deliveries" label="delivery details" interactive><SupplierPendingDeliveries orders={panelStats.pendingDeliveries} onOpenOrder={(id) => router.push(`/supplier/orders/${id}` as any)} /></DashboardDetailLink>
              <DashboardDetailLink href="/supplier/deliveries" label="delivery alerts" interactive><SupplierAlertsPanel orders={panelStats.late} /></DashboardDetailLink>
            </View>
          </View>
        </DashboardContent>
      )}
    </View>
  );
}
