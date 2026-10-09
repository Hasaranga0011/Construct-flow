import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

const DeliveryRow = ({ order, onOpenOrder }: { order: any, onOpenOrder: (id: string) => void }) => {
  const projectName = order.project_name || order.projects?.name || 'Unknown Project';
  const projectLocation = order.project_location || order.projects?.location || '';

  // Check if expected delivery date has passed
  const today = new Date().toISOString().split('T')[0];
  const isLate = order.expected_date && order.expected_date < today;

  return (
    <View className={`flex-row items-center py-3 border-b border-gray-50 ${isLate ? 'bg-red-50/30 -mx-6 px-6' : ''}`}>
      <View className={`w-11 h-11 rounded-full items-center justify-center mr-3 ${isLate ? 'bg-red-100' : 'bg-orange-100'}`}>
        <FontAwesome5 name="truck" size={16} color={isLate ? '#EF4444' : '#F97316'} />
      </View>

      <View className="flex-1">
        <View className="flex-row items-center mb-0.5">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm mr-2">{order.items || order.po_number}</Text>
          {isLate && (
             <View className="bg-red-100 px-2 py-0.5 rounded">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-[10px] font-bold uppercase">Overdue</Text>
             </View>
          )}
        </View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-[10px] mb-1">
          Due: {order.expected_date || 'TBD'} | Qty: {order.quantity_ordered}
        </Text>
        <Text style={[{ flexShrink: 1, minWidth: 0 }, { minHeight: 44, minWidth: 44 }]} maxFontSizeMultiplier={1.3}
          onPress={() => {
            if (projectLocation) {
              if (Platform.OS === 'web') window.alert(projectLocation);
              else Alert.alert('Project Location', projectLocation);
            }
          }}
          className={`text-gray-500 text-xs ${projectLocation ? 'underline cursor-pointer hover:text-brand-orange' : ''}`}

        >
          {projectName}
        </Text>
      </View>

      <Pressable style={{ minHeight: 44, minWidth: 44 }}
        onPress={() => onOpenOrder(order.id)}
        className="bg-brand-orange px-4 py-2 rounded-md ml-2 shadow-sm"
      >
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold text-center">View</Text>
      </Pressable>
    </View>
  );
};

export const SupplierPendingDeliveries = ({
  orders: sourceOrders,
  loading: sourceLoading = false,
  onOpenOrder,
}: {
  orders: any[],
  loading?: boolean,
  onOpenOrder: (id: string) => void,
}) => {
  const orders = sourceOrders.slice(0, 5).map(o => ({ ...o, projects: o.projects || { name: o.project_name } }));
  const loading = sourceLoading;

  return (
    <View className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800">Pending Deliveries</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">Confirmed orders awaiting dispatch</Text>
        </View>
        <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
          <FontAwesome5 name="boxes" size={14} color="#F97316" />
        </View>
      </View>

      <View>
        {loading ? (
          <ActivityIndicator color="#F97316" className="py-4" />
        ) : orders.length === 0 ? (
          <View className="items-center py-6">
            <FontAwesome5 name="check-circle" size={24} color="#D1D5DB" className="mb-3" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm font-medium">No confirmed orders awaiting dispatch.</Text>
          </View>
        ) : (
          orders.map(order => (
            <DeliveryRow
              key={order.id}
              order={order}
              onOpenOrder={onOpenOrder}
            />
          ))
        )}
      </View>
    </View>
  );
};
