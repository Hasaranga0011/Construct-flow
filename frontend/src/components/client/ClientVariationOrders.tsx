import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ClientVariationOrders = () => {
  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-brand-orange/30 flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Variation Orders</Text>
          <Text className="text-gray-500 text-xs">Scope changes requiring approval</Text>
        </View>
        <View className="bg-orange-50 px-3 py-1 rounded-full">
          <Text className="text-brand-orange text-xs font-bold">1 Pending</Text>
        </View>
      </View>
      
      <View className="border border-gray-100 rounded-lg p-5 bg-gray-50 mb-4">
        <View className="flex-row justify-between items-start mb-3">
          <View>
            <Text className="font-bold text-brand-text text-base mb-1">Premium Tile Upgrade</Text>
            <Text className="text-gray-500 text-xs">VO-004 • Requested by PM</Text>
          </View>
          <Text className="font-extrabold text-brand-orange text-lg">+Rs. 250,000</Text>
        </View>
        
        <Text className="text-gray-600 text-sm leading-relaxed mb-5">
          Upgrading ground floor lobby tiles from standard ceramic (60x60) to premium marble-finish porcelain (80x80) as per client request during site visit.
        </Text>
        
        <View className="flex-row gap-3">
          <Pressable className="flex-1 bg-white border border-gray-300 py-2.5 rounded-lg items-center hover:bg-gray-100 transition-colors">
            <Text className="text-gray-700 font-bold">Reject</Text>
          </Pressable>
          <Pressable className="flex-1 bg-brand-success py-2.5 rounded-lg items-center shadow-sm hover:bg-green-600 transition-colors">
            <Text className="text-white font-bold">Sign & Approve</Text>
          </Pressable>
        </View>
      </View>
      
      <View className="border border-gray-100 rounded-lg p-4 flex-row justify-between items-center opacity-70">
        <View>
          <Text className="font-semibold text-gray-700 mb-1">Additional Windows</Text>
          <Text className="text-gray-400 text-xs">VO-002 • Approved on Nov 10</Text>
        </View>
        <View className="items-end">
          <Text className="font-bold text-gray-600 mb-1">+Rs. 180,000</Text>
          <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
        </View>
      </View>
    </View>
  );
};
