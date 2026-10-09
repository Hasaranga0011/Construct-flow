import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { TopNav } from '../common/TopNav';
import { SearchInput } from '../common/SearchInput';
import { useResponsive } from '../../hooks/useResponsive';
import { formatMoney } from '../../utils/format';
import {
  useSupplierOrders,
  matchesSupplierSearch,
  buildOrderSuggestions,
  SUPPLIER_STATUS_TABS,
  PO_STATUS,
} from '../../hooks/useSupplierOrders';

const getStatusColor = (status: string) => {
  switch (status) {
    case PO_STATUS.RECEIVED: return 'bg-green-100 text-green-700';
    case PO_STATUS.DELIVERED: return 'bg-purple-100 text-purple-700';
    case PO_STATUS.PENDING: return 'bg-orange-100 text-orange-700';
    case PO_STATUS.SUGGESTED: return 'bg-yellow-100 text-yellow-700';
    case PO_STATUS.REJECTED: case PO_STATUS.CANCELLED: return 'bg-red-100 text-red-700';
    default: return 'bg-blue-100 text-blue-700';
  }
};

const safeDate = (d?: string | null) => {
  if (!d) return '';
  try { return format(new Date(d), 'MMM dd, yyyy'); } catch { return ''; }
};

/**
 * Shared list used by /supplier/deliveries and /supplier/orders.
 * All tabs filter the SAME realtime list by the exact stored status string,
 * so "All" and every individual tab can never disagree.
 */
export function SupplierOrdersList({ title, defaultStatus = 'All' }: { title: string; defaultStatus?: string }) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { orders, projects, loading, lastUpdated, refresh } = useSupplierOrders();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [projectFilter, setProjectFilter] = useState('All');

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => map.set(p.id, p.name));
    orders.forEach(o => { if (o.project_id && !map.has(o.project_id)) map.set(o.project_id, o.project_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projects, orders]);

  // Orders after project + search (tab counts reflect these).
  const baseFiltered = useMemo(
    () => orders.filter(o =>
      (projectFilter === 'All' || o.project_id === projectFilter) && matchesSupplierSearch(o, search)
    ),
    [orders, projectFilter, search]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: baseFiltered.length };
    SUPPLIER_STATUS_TABS.forEach(s => { if (s !== 'All') counts[s] = 0; });
    baseFiltered.forEach(o => { if (counts[o.status] !== undefined) counts[o.status] += 1; });
    return counts;
  }, [baseFiltered]);

  const visible = useMemo(
    () => statusFilter === 'All' ? baseFiltered : baseFiltered.filter(o => o.status === statusFilter),
    [baseFiltered, statusFilter]
  );

  const getSuggestions = useCallback((q: string) => buildOrderSuggestions(orders, q), [orders]);
  const openOrder = (id: string) => router.push(`/supplier/orders/${id}` as any);

  const emptyMessage = search.trim()
    ? `No orders match "${search}"${statusFilter !== 'All' ? ` in ${statusFilter}` : ''}.`
    : statusFilter === 'All'
      ? 'No purchase orders yet.'
      : `No orders are currently "${statusFilter}".`;

  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav title={title} actionLabel="Refresh" onActionPress={refresh} />

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/supplier/dashboard' as any)} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back</Text>
        </Pressable>

        {/* Header row — zIndex keeps the search overlay above the list card below */}
        <View style={{ zIndex: 20, position: 'relative', marginBottom: 16, gap: 12 }}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, zIndex: 30 }}>
            <View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">{title}</Text>
              <View className="flex-row items-center mt-1">
                <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] text-gray-500">
                  Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
                </Text>
              </View>
            </View>
            <View style={{ width: isMobile ? '100%' : 320 }}>
              <SearchInput
                placeholder="Search PO, material, project..."
                value={search}
                onChangeText={setSearch}
                getLocalResults={getSuggestions}
                onSelectResult={(item) => openOrder(item.id)}
              />
            </View>
          </View>

          <View className="flex-row border border-gray-200 rounded-lg overflow-hidden bg-white self-start max-w-full">
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
              {SUPPLIER_STATUS_TABS.map(s => {
                const active = statusFilter === s;
                return (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    className={`px-4 py-2 flex-row items-center ${active ? 'bg-brand-orange' : 'hover:bg-gray-50'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-xs ${active ? 'text-white' : 'text-gray-500'}`}>{s}</Text>
                    <View className={`ml-1.5 px-1.5 rounded-full ${active ? 'bg-white/25' : 'bg-gray-100'}`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold ${active ? 'text-white' : 'text-gray-500'}`}>{tabCounts[s] ?? 0}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {projectOptions.length > 0 && (
            <View className="flex-row border border-gray-200 rounded-lg overflow-hidden bg-white self-start max-w-full">
              <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => setProjectFilter('All')}
                  className={`px-4 py-2 ${projectFilter === 'All' ? 'bg-blue-600' : 'hover:bg-gray-50'}`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-xs ${projectFilter === 'All' ? 'text-white' : 'text-gray-500'}`}>All Projects</Text>
                </Pressable>
                {projectOptions.map(p => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={p.id}
                    onPress={() => setProjectFilter(p.id)}
                    className={`px-4 py-2 ${projectFilter === p.id ? 'bg-blue-600' : 'hover:bg-gray-50'}`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-semibold text-xs ${projectFilter === p.id ? 'text-white' : 'text-gray-500'}`}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={isMobile ? { zIndex: 1 } : { zIndex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">PO Number</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[22%] text-xs font-semibold text-gray-500 uppercase">Material / Qty</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Project</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[14%] text-xs font-semibold text-gray-500 uppercase">Total Cost</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>
          )}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : visible.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="cart-outline" size={48} color="#D1D5DB" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium mt-4">{emptyMessage}</Text>
            </View>
          ) : (
            visible.map(o => (
              isMobile ? (
                <View key={o.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16 }]}>{o.items || 'Unknown'}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>PO: {o.po_number || 'N/A'}</Text>
                    </View>
                    <View className={`px-2 py-1 rounded self-start ${getStatusColor(o.status)}`}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }]}>{o.status}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Project</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#374151', fontWeight: '600' }]}>{o.project_name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Total Cost</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 14 }]}>{formatMoney(o.total_price || 0)}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => openOrder(o.id)} style={[{ backgroundColor: '#F97316', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}>
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontSize: 14, fontWeight: 'bold' }]}>View Order</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={o.id} className="flex-row items-center py-4 border-b border-gray-100">
                  <View className="w-[15%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm">{o.po_number || 'N/A'}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">{safeDate(o.created_at)}</Text>
                  </View>
                  <View className="w-[22%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">{o.items || 'Unknown'}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Qty: {o.quantity_ordered || 0}</Text>
                  </View>
                  <View className="w-[20%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">{o.project_name}</Text>
                  </View>
                  <View className="w-[14%]">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-bold">{formatMoney(o.total_price || 0)}</Text>
                  </View>
                  <View className="w-[15%]">
                    <View className={`px-2 py-1 rounded self-start ${getStatusColor(o.status)}`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] font-bold uppercase">{o.status}</Text>
                    </View>
                  </View>
                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => openOrder(o.id)} className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">View</Text>
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
