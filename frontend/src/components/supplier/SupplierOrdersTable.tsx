import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Alert, Modal, TextInput, Platform } from 'react-native';
import { api } from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';

const showError = (fallback: string, e: any) => {
  const msg = e?.message || e?.detail || fallback;
  if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
};



const OrderRow = ({ order, onOpen, isMobile }: any) => {
  const projectName = order.project_name || order.projects?.name || 'Unknown Project';
  const isPending = order.status === 'Pending Delivery';
  const isConfirmed = order.status === 'Confirmed';
  const isRejected = order.status === 'Rejected';
  const isSuggested = order.status === 'Suggested';
  const isDelivered = order.status === 'Delivered';
  const isReceived = order.status === 'Received';

  const getStatusColor = () => {
    if (isPending) return 'bg-orange-100 text-brand-warning';
    if (isConfirmed) return 'bg-blue-100 text-blue-600';
    if (isRejected) return 'bg-red-100 text-red-600';
    if (isSuggested) return 'bg-yellow-100 text-yellow-700';
    if (isDelivered) return 'bg-purple-100 text-purple-700';
    if (isReceived) return 'bg-green-100 text-green-700';
    return 'bg-green-100 text-green-600';
  };

  if (isMobile) {
    return (
      <View style={{ flexDirection: 'column', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text onPress={onOpen ? () => onOpen(order.id) : undefined} style={{ color: '#111827', fontWeight: 'bold', fontSize: 16, textDecorationLine: onOpen ? 'underline' : 'none' }}>{order.po_number}</Text>
            <Text 
              onPress={() => {
                if (order.project_location) {
                  if (Platform.OS === 'web') window.alert(order.project_location);
                  else Alert.alert('Project Location', order.project_location);
                }
              }}
              style={{ color: '#6B7280', fontSize: 12, textDecorationLine: order.project_location ? 'underline' : 'none' }}
            >
              {projectName}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View className={`px-2 py-1 rounded ${getStatusColor().split(' ')[0]}`}>
              <Text className={`text-[10px] font-bold uppercase ${getStatusColor().split(' ')[1]}`}>{order.status}</Text>
            </View>
          </View>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Items</Text>
            <Text style={{ color: '#374151', fontWeight: '600' }} numberOfLines={2}>
              {order.items || `Material ID: ${order.material_id}`}
            </Text>
            {isSuggested && order.supplier_notes && (() => {
              try {
                const log = JSON.parse(order.supplier_notes);
                if (Array.isArray(log) && log.length > 0) {
                  const lastNote = [...log].reverse().find((e: any) => e.note);
                  if (lastNote) return <Text style={{ color: '#CA8A04', fontSize: 11, fontStyle: 'italic', marginTop: 4 }} numberOfLines={1}>Note: {lastNote.note}</Text>;
                }
              } catch(e) {}
              return <Text style={{ color: '#CA8A04', fontSize: 11, fontStyle: 'italic', marginTop: 4 }} numberOfLines={1}>Note: {order.supplier_notes}</Text>;
            })()}
          </View>
          <View style={{ alignItems: 'flex-end', paddingLeft: 8 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Quantity / Cost</Text>
            {isSuggested ? (
               <Text style={{ color: '#9CA3AF', fontSize: 14, fontWeight: '500', textDecorationLine: 'line-through' }}>{order.quantity_ordered}</Text>
            ) : (
               <Text style={{ color: '#111827', fontSize: 14, fontWeight: 'bold' }}>{order.quantity_ordered}</Text>
            )}
            {isSuggested && (
               <Text style={{ color: '#A16207', fontSize: 14, fontWeight: 'bold' }}>{order.suggested_quantity}</Text>
            )}
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Rs. {order.total_price}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Expected By</Text>
            {isSuggested ? (
               <Text style={{ color: '#9CA3AF', fontSize: 14, fontWeight: '500', textDecorationLine: 'line-through' }}>{order.expected_date}</Text>
            ) : (
               <Text style={{ color: '#111827', fontSize: 14, fontWeight: 'bold' }}>{order.expected_date}</Text>
            )}
            {isSuggested && (
               <Text style={{ color: '#A16207', fontSize: 14, fontWeight: 'bold' }}>{order.suggested_date}</Text>
            )}
          </View>
        </View>
        
        <Pressable onPress={() => onOpen && onOpen(order.id)} style={{ backgroundColor: '#F97316', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>View Order</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center py-4 border-b border-gray-100">
      <View className="w-[15%] pr-2">
        <Text onPress={onOpen ? () => onOpen(order.id) : undefined} className={`text-brand-text font-bold text-sm truncate ${onOpen ? 'hover:text-brand-orange underline' : ''}`} numberOfLines={1}>{order.po_number}</Text>
        <Text 
          onPress={() => {
            if (order.project_location) {
              if (Platform.OS === 'web') window.alert(order.project_location);
              else Alert.alert('Project Location', order.project_location);
            }
          }}
          className={`text-gray-500 text-xs truncate ${order.project_location ? 'underline cursor-pointer hover:text-brand-orange' : ''}`} 
          numberOfLines={1}
        >
          {projectName}
        </Text>
      </View>

      <View className="w-[20%] pr-2">
        <Text className="text-brand-text text-sm" numberOfLines={2}>
          {order.items || `Material ID: ${order.material_id}`}
        </Text>
        {isSuggested && order.supplier_notes && (() => {
          try {
            const log = JSON.parse(order.supplier_notes);
            if (Array.isArray(log) && log.length > 0) {
              const lastNote = [...log].reverse().find((e: any) => e.note);
              if (lastNote) return <Text className="text-yellow-600 text-xs italic mt-1" numberOfLines={1}>Note: {lastNote.note}</Text>;
            }
          } catch(e) {}
          return <Text className="text-yellow-600 text-xs italic mt-1" numberOfLines={1}>Note: {order.supplier_notes}</Text>;
        })()}
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text className="text-brand-text text-sm font-medium line-through text-gray-400">{order.quantity_ordered}</Text>
        ) : (
           <Text className="text-brand-text text-sm font-medium">{order.quantity_ordered}</Text>
        )}
        {isSuggested && (
           <Text className="text-yellow-700 text-sm font-bold">{order.suggested_quantity}</Text>
        )}
        <Text className="text-gray-400 text-xs truncate">Total: Rs. {order.total_price}</Text>
      </View>

      <View className="w-[12%]">
        {isSuggested ? (
           <Text className="text-brand-text text-sm font-medium line-through text-gray-400">{order.expected_date}</Text>
        ) : (
           <Text className="text-brand-text text-sm font-medium">{order.expected_date}</Text>
        )}
        {isSuggested && (
           <Text className="text-yellow-700 text-sm font-bold">{order.suggested_date}</Text>
        )}
      </View>

      <View className="w-[12%]">
        <View className={`px-2 py-1 rounded self-start ${getStatusColor().split(' ')[0]}`}>
          <Text className={`text-xs font-semibold ${getStatusColor().split(' ')[1]}`}>
            {order.status}
          </Text>
        </View>
      </View>

      <View className="flex-1 flex-row justify-end pl-1">
        <Pressable onPress={() => onOpen && onOpen(order.id)} className="bg-brand-orange px-3 py-1.5 rounded-md shadow-sm">
          <Text className="text-white text-xs font-bold">View</Text>
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
  const { isMobile } = useResponsive();
  const orders = sourceOrders.map(o => ({ ...o, projects: o.projects || { name: o.project_name } }));
  const loading = sourceLoading;

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[500px]">
      <View className="mb-6">
        <Text className="text-lg font-bold text-brand-text mb-1">{title}</Text>
        <Text className="text-brand-text-muted text-xs">{subtitle}</Text>
      </View>

      {!isMobile && (
        <View className="flex-row py-3 border-b border-gray-200 pr-2">
          <Text className="w-[15%] text-xs font-semibold text-gray-500 uppercase">PO / Project</Text>
          <Text className="w-[20%] text-xs font-semibold text-gray-500 uppercase">Items</Text>
          <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Quantity / Cost</Text>
          <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Expected By</Text>
          <Text className="w-[12%] text-xs font-semibold text-gray-500 uppercase">Status</Text>
          <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase text-right">Action</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : orders.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <Text className="text-gray-400">No orders awaiting your response.</Text>
          </View>
        ) : (
          orders.map(order => (
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
