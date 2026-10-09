import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ClientPaymentSchedule = () => {
  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-4">Upcoming Payments</Text>
      
      <View className="bg-orange-50 rounded-xl p-4 border border-brand-orange flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4 border border-orange-200">
            <Ionicons name="calendar" size={20} color="#F97316" />
          </View>
          <View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs uppercase mb-1">Due in 5 Days</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">Superstructure Phase 2</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-xs mt-0.5">Invoice #INV-003</Text>
          </View>
        </View>
        <View className="items-end">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-extrabold text-xl mb-1">Rs. 2.5M</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="bg-white px-2 py-1 rounded text-orange-600 text-[10px] font-bold border border-orange-100 shadow-sm">Pay Now</Text>
        </View>
      </View>
      
      <View className="flex-row justify-between py-3 border-b border-gray-50">
        <View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-brand-text text-sm mb-1">MEP First Fix</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Estimated: Jan 2027</Text>
        </View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-700">Rs. 1.8M</Text>
      </View>
      
      <View className="flex-row justify-between py-3">
        <View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-semibold text-brand-text text-sm mb-1">Finishing Phase</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Estimated: Mar 2027</Text>
        </View>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-gray-700">Rs. 2.0M</Text>
      </View>
    </View>
  );
};
