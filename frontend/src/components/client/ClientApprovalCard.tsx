import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ClientApprovalCard = () => {
  return (
    <View className="bg-white rounded-xl p-5 shadow-sm border border-brand-orange/30">
      <View className="flex-row items-center mb-4">
        <View className="w-11 h-11 bg-orange-100 rounded-full items-center justify-center mr-3">
          <Ionicons name="document-text" size={20} color="#F97316" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">Action Required</Text>
            <View className="bg-red-50 px-2 py-0.5 rounded">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-[10px] font-bold uppercase">Pending</Text>
            </View>
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">Variation Order #VO-003</Text>
        </View>
      </View>
      
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-medium text-sm mb-4 leading-relaxed">
        Additional structural reinforcement required for the ground floor lobby area as discussed during the site visit.
      </Text>
      
      <View className="bg-gray-50 p-3 rounded-lg flex-row justify-between items-center mb-5 border border-gray-100">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">Additional Cost:</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base">Rs. 450,000</Text>
      </View>
      
      <View className="flex-row gap-3">
        <Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-1 bg-white border border-gray-300 py-3 rounded-lg items-center hover:bg-gray-50">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold">Reject</Text>
        </Pressable>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-1 bg-brand-success py-3 rounded-lg items-center shadow-sm hover:bg-green-600">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Approve</Text>
        </Pressable>
      </View>
    </View>
  );
};
