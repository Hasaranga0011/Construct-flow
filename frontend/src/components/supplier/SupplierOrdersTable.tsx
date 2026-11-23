import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader, TableSortControl } from '@/components/common/SortableHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import React from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert, Platform } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useTableLayout } from '@/hooks/useTableLayout';




const OrderRow = ({ order, onOpen, isMobile }: any) => {
  const projectName = order.project_name || order.projects?.name || 'Unknown Project';

  const isSuggested = order.status === 'Suggested';

  if (isMobile) {
    return (
      <View style={{ flexDirection: 'column', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', width: '100%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, width: '100%' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={1.3} onPress={onOpen ? () => onOpen(order.id) : undefined} style={[[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 16, textDecorationLine: onOpen ? 'underline' : 'none' }], { minHeight: 44, minWidth: 44 }]}>{order.po_number}</Text>
            <Text maxFontSizeMultiplier={1.3}
              onPress={() => {
                if (order.project_location) {
                  if (Platform.OS === 'web') window.alert(order.project_location);
                  else Alert.alert('Project Location', order.project_location);
                }
              }}
              style={[[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12, textDecorationLine: order.project_location ? 'underline' : 'none' }], { minHeight: 44, minWidth: 44 }]}
            >
              {projectName}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <StatusBadge status={order.status} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Items</Text>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#374151', fontWeight: '600' }]}>
              {order.items || `Material ID: ${order.material_id}`}
            </Text>
            {isSuggested && order.supplier_notes && (() => {
              try {
                const log = JSON.parse(order.supplier_notes);
                if (Array.isArray(log) && log.length > 0) {
                  const lastNote = [...log].reverse().find((e: any) => e.note);
                  if (lastNote) return <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#CA8A04', fontSize: 11, fontStyle: 'italic', marginTop: 4 }]}>Note: {lastNote.note}</Text>;
                }
              } catch {}
              return <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#CA8A04', fontSize: 11, fontStyle: 'italic', marginTop: 4 }]}>Note: {order.supplier_notes}</Text>;
            })()}
          </View>
          <View style={{ alignItems: 'flex-end', paddingLeft: 8 }}>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Quantity / Cost</Text>
            {isSuggested ? (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 14, fontWeight: '500', textDecorationLine: 'line-through' }]}>{order.quantity_ordered}</Text>
            ) : (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontSize: 14, fontWeight: 'bold' }]}>{order.quantity_ordered}</Text>
            )}
            {isSuggested && (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#A16207', fontSize: 14, fontWeight: 'bold' }]}>{order.suggested_quantity}</Text>
            )}
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 12 }]}>Rs. {order.total_price}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 12, marginBottom: 4 }]}>Expected By</Text>
            {isSuggested ? (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#9CA3AF', fontSize: 14, fontWeight: '500', textDecorationLine: 'line-through' }]}>{order.expected_date}</Text>
            ) : (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontSize: 14, fontWeight: 'bold' }]}>{order.expected_date}</Text>
            )}
            {isSuggested && (
               <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#A16207', fontSize: 14, fontWeight: 'bold' }]}>{order.suggested_date}</Text>
            )}
          </View>
        </View>

        <Pressable onPress={() => onOpen && onOpen(order.id)} style={[{ backgroundColor: '#F97316', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}>
          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#fff', fontSize: 14, fontWeight: 'bold' }]}>View Order</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      <View className="w-[15%] pr-2">
        <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3} onPress={onOpen ? () => onOpen(order.id) : undefined} className={`text-brand-text dark:text-slate-100 font-bold text-sm ${onOpen ? 'hover:text-brand-orange underline' : ''}`}>{order.po_number}</Text>
        <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3}
          onPress={() => {
            if (order.project_location) {
              if (Platform.OS === 'web') window.alert(order.project_location);
              else Alert.alert('Project Location', order.project_location);
            }
          }}
          className={`text-slate-500 dark:text-slate-400 text-xs ${order.project_location ? 'underline cursor-pointer hover:text-brand-orange' : ''}`}

        >
          {projectName}
        </Text>
      </View>

      <View className="w-[20%] pr-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-sm">
          {order.items || `Material ID: ${order.material_id}`}
        </Text>
        {isSuggested && order.supplier_notes && (() => {
          try {
            const log = JSON.parse(order.supplier_notes);
            if (Array.isArray(log) && log.length > 0) {
              const lastNote = [...log].reverse().find((e: any) => e.note);
              if (lastNote) return <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-600 text-xs italic mt-1">Note: {lastNote.note}</Text>;
            }
          } catch {}
          return <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-600 text-xs italic mt-1">Note: {order.supplier_notes}</Text>;
        })()}
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-sm font-medium line-through text-gray-400">{order.quantity_ordered}</Text>
        ) : (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-sm font-medium">{order.quantity_ordered}</Text>
        )}
        {isSuggested && (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-700 text-sm font-bold">{order.suggested_quantity}</Text>
        )}
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs">Total: Rs. {order.total_price}</Text>
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-sm font-medium line-through text-gray-400">{order.expected_date}</Text>
        ) : (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 text-sm font-medium">{order.expected_date}</Text>
        )}
        {isSuggested && (
           <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-700 text-sm font-bold">{order.suggested_date}</Text>
        )}
      </View>

      <View className="w-[144px] shrink-0">
        <StatusBadge status={order.status} />
      </View>

      <View className="flex-1 flex-row justify-end pl-1">
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => onOpen && onOpen(order.id)} className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">View</Text>
        </Pressable>
      </View>
    </View>
  );
};


export const SupplierOrdersTable = ({
  orders: sourceOrders,
  loading: sourceLoading = false,
  onOpenOrder,
  title = 'Incoming Purchase Orders',
  subtitle = 'Awaiting your response or admin review of your counter-offer',
}: {
  orders: any[],
  loading?: boolean,
  onOpenOrder?: (id: string) => void,
  title?: string,
  subtitle?: string,
}) => {
  const tableSort = useTableSort({"PO / Project":r=>r.po_number||r.projects?.name,"Items":r=>r.items,"Quantity / Cost":r=>r.quantity_ordered,"Expected By":r=>r.status==='Suggested'?r.suggested_date:r.expected_date,"Status":r=>r.status});
  const { isCompact:isMobile, onLayout } = useTableLayout(980);
  const orders = sourceOrders.map(o => ({ ...o, projects: o.projects || { name: o.project_name } }));
  const loading = sourceLoading;

  return (
    <View onLayout={onLayout} className={`bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 dark:border-slate-700 ${isMobile ? '' : 'flex-1 min-h-[500px]'}`}>
      <TableSortControl sort={tableSort}/>
      <View className="mb-6">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text dark:text-slate-100 mb-1">{title}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text-muted text-xs">{subtitle}</Text>
      </View>

      {!isMobile && (
        <View className="flex-row py-3 border-b border-gray-200 pr-2">
          <SortableHeader sort={tableSort} column="PO / Project" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[15%] text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">PO / Project</SortableHeader>
          <SortableHeader sort={tableSort} column="Items" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[20%] text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Items</SortableHeader>
          <SortableHeader sort={tableSort} column="Quantity / Cost" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[12%] text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Quantity / Cost</SortableHeader>
          <SortableHeader sort={tableSort} column="Expected By" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[12%] text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Expected By</SortableHeader>
          <SortableHeader sort={tableSort} column="Status" style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-[144px] shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</SortableHeader>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Action</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} className="flex-1">
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : orders.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No orders awaiting your response.</Text>
          </View>
        ) : (
          tableSort.sort(orders).map(order => (
            <OrderRow
              key={order.id}
              order={order}
              isMobile={isMobile}
              onOpen={onOpenOrder}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};
