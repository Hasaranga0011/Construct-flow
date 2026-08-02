import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ClientWeatherAlert = () => {
  return (
    <View className="bg-blue-50 rounded-xl p-5 border border-blue-100 flex-row items-start mb-4">
      <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center mr-4">
        <Ionicons name="rainy" size={20} color="#3B82F6" />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-blue-900 mb-1">Weather Impact Alert</Text>
        <Text className="text-blue-800 text-sm leading-tight">
          Heavy rain expected this week. Potential 2-day delay for exterior painting and landscaping works.
        </Text>
      </View>
    </View>
  );
};
