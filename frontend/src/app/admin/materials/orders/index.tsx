import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader, TableSortControl } from '@/components/common/SortableHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import React, { useEffect, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { View, Text, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { useTableLayout } from '@/hooks/useTableLayout';
import { formatMoney } from '../../../../utils/format';
import { FilterChipGrid } from '@/components/common/FilterChipGrid';
import { useAuth } from '@/context/AuthContext';
import { ErrorState } from '@/components/ui';

export default function AdminPurchaseOrders() {
  const router = useRouter();
  const params = useLocalSearchParams<{ project_id?: string; supplier_id?: string }>();
  const scopedProjectId = Array.isArray(params.project_id) ? params.project_id[0] : params.project_id;
  const scopedSupplierId = Array.isArray(params.supplier_id) ? params.supplier_id[0] : params.supplier_id;
  const { user, role } = useAuth();
  const isPM = role === 'pm';
  const basePath = isPM ? '/pm/materials/orders' : '/admin/materials/orders';
  const { isCompact:isMobile, onLayout } = useTableLayout(1000);
  const [loadError,setLoadError]=useState('');
  const [retryTick,setRetryTick]=useState(0);
  const tableSort = useTableSort({"PO Number":r=>r.po_number,"Material / Qty":r=>r.items,"Supplier":r=>r.supplier_name,"Total Cost":r=>r.total_price,"Status":r=>r.status},()=>setPage(0));
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const pageSize = 25;
  useEffect(() => {
    const timer = setTimeout(() => { setSearchTerm(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const fetchOrders = async () => {
      setLoadError('');
      setLoading(true);
      try {
        let pmProjectIds: string[] = [];
        if (isPM && user?.id) {
          const { data: projData, error: projectError } = await supabase.from('projects').select('id').eq('pm_id', user.id);
          if (projectError) throw projectError;
          pmProjectIds = (projData || []).map(p => p.id).filter((id): id is string => Boolean(id));
          if (pmProjectIds.length === 0) {
            if (isMounted) { setOrders([]); setTotal(0); }
            return;
          }
        }

        const fields:Record<string,string>={'PO Number':'po_number','Material / Qty':'items','Supplier':'supplier_name','Total Cost':'total_price','Status':'status'};
        let query = supabase.from('purchase_orders').select('*', { count: 'exact' }).order(fields[tableSort.column]||'created_at', { ascending: !!tableSort.column&&tableSort.direction==='asc', nullsFirst:false }).order('id', { ascending: false });

        if (pmProjectIds.length > 0) {
          query = query.in('project_id', pmProjectIds);
        }

        if (scopedProjectId) query = query.eq('project_id', scopedProjectId);
        if (scopedSupplierId) query = query.eq('supplier_id', scopedSupplierId);
        if (statusFilter !== 'All') {
          query = query.eq('status', statusFilter);
        }

        if (searchTerm) {
          // Quote PostgREST values so commas/parentheses cannot alter the filter.
          const literal = `"%${searchTerm.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '\\%').replace(/_/g, '\\_')}%"`;
          query = query.or(`po_number.ilike.${literal},items.ilike.${literal},supplier_name.ilike.${literal}`);
        }
        const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1).abortSignal(controller.signal);
        if (error) throw error;

        if (isMounted) {
          setTotal(count || 0);
          if (page > 0 && page * pageSize >= (count || 0)) setPage(Math.max(0, Math.ceil((count || 0) / pageSize) - 1));
          setOrders(data || []);
        }
      } catch (err) {
        if(isMounted)setLoadError(err instanceof Error?err.message:'Unable to load purchase orders.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    return () => { isMounted = false; controller.abort(); };
  }, [statusFilter, isPM, user?.id, scopedProjectId, scopedSupplierId, retryTick, page, searchTerm, tableSort.column, tableSort.direction]);

  const visibleOrders = orders;

  const statuses = ['All', 'Pending Delivery', 'Suggested', 'Rejected', 'Confirmed', 'Delivered', 'Received', 'Cancelled'];


  return (
    <View className="flex-1 flex-col bg-gray-50">
      <TopNav
        title="Purchase Orders"
        actionLabel="+ New Order"
        onActionPress={() => router.push(`${basePath}/create${scopedProjectId?'?project_id='+scopedProjectId:''}` as any)}
      />
      <View className="px-4 pt-3"><TableSortControl sort={tableSort}/></View>

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8" showsVerticalScrollIndicator={false}>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(`/${isPM?'pm':'admin'}/materials${scopedProjectId?'?project='+scopedProjectId:''}` as any)} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-semibold ml-2">Back to Materials</Text>
        </Pressable>

        <View style={{ flexDirection: 'column', marginBottom: 24, gap: 16 }}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">All Orders</Text>

            <View className={`flex-row items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 ${isMobile ? 'w-full' : 'w-80'}`}>
              <Ionicons name="search-outline" size={18} color="#64748b" />
              <TextInput accessibilityLabel="Search purchase orders" placeholder="Search PO, item or supplier" value={search} onChangeText={setSearch} className="flex-1 min-w-0 py-3 text-sm text-slate-800" />
              {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear order search" onPress={() => setSearch('')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={18} color="#64748b" /></Pressable>}
            </View>
          </View>

          <FilterChipGrid
            options={statuses.map(s => ({ id: s, label: s }))}
            selectedValue={statusFilter}
            onSelect={value => { setStatusFilter(value); setPage(0); }}
          />
        </View>

        <View onLayout={onLayout} style={isMobile ? {} : { backgroundColor: '#fff', borderRadius: 12, padding: 24, minHeight: 400, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {!isMobile && (
            <View className="flex-row py-3 border-b border-gray-200 pr-2">
              <SortableHeader sort={tableSort} column="PO Number" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">PO Number</SortableHeader>
              <SortableHeader sort={tableSort} column="Material / Qty" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Material / Qty</SortableHeader>
              <SortableHeader sort={tableSort} column="Supplier" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Supplier</SortableHeader>
              <SortableHeader sort={tableSort} column="Total Cost" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Total Cost</SortableHeader>
              <SortableHeader sort={tableSort} column="Status" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-gray-500 uppercase">Status</SortableHeader>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
            </View>
          )}

          {loadError ? <ErrorState message={loadError} onRetry={()=>setRetryTick(tick=>tick+1)}/> : loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator color="#F97316" />
            </View>
          ) : visibleOrders.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <Ionicons name="cart-outline" size={48} color="#D1D5DB" className="mb-4" />
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg font-medium">No purchase orders found.</Text>
            </View>
          ) : (
            visibleOrders.map(o => (
              isMobile ? (
                <View key={o.id} style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16 }]}>{o.items || 'Unknown'}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>PO: {o.po_number || 'N/A'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <StatusBadge status={o.status} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Supplier</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#374151', fontWeight: '600' }]}>{o.supplier_name || 'Unassigned'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Total Cost</Text>
                      {(!o.total_price || o.total_price === 0) && (o.status === 'Pending' || o.status === 'Suggested') ? (
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontStyle: 'italic', fontSize: 12 }]}>Awaiting price</Text>
                      ) : (
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 14 }]}>
                          {formatMoney(o.total_price || 0)}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => router.push(`${basePath}/${o.id}` as any)}
                    style={[{ backgroundColor: '#F97316', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontSize: 14, fontWeight: 'bold' }]}>View Order</Text>
                  </Pressable>
                </View>
              ) : (
                <View key={o.id} className="flex-row items-center py-4 border-b border-gray-100">
                  <View className="w-[15%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm truncate">{o.po_number || 'N/A'}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[10px]">{format(new Date(o.created_at), 'MMM dd, yyyy')}</Text>
                  </View>

                  <View className="w-[20%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm truncate">{o.items || 'Unknown'}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Qty: {o.quantity_ordered || 0}</Text>
                  </View>

                  <View className="w-[20%] pr-2">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm truncate">{o.supplier_name || 'Unassigned'}</Text>
                  </View>

                  <View className="w-[15%]">
                    {(!o.total_price || o.total_price === 0) && (o.status === 'Pending' || o.status === 'Suggested') ? (
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-xs">Awaiting price</Text>
                    ) : (
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text text-sm font-bold">
                        {formatMoney(o.total_price || 0)}
                      </Text>
                    )}
                  </View>

                  <View className="w-[15%]">
                    <StatusBadge status={o.status} />
                  </View>

                  <View className="flex-1 flex-row justify-end pl-1">
                    <Pressable style={{ minHeight: 44, minWidth: 44 }}
                      onPress={() => router.push(`${basePath}/${o.id}` as any)}
                      className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm"
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">View</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ))
          )}
        </View>
        {!loadError && <Pagination page={page} pageSize={pageSize} total={total} loading={loading} onChange={setPage} />}
      </ScrollView>
    </View>
  );
}
