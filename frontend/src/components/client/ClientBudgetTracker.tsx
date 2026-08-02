import React from 'react';
import { View, Text } from 'react-native';

export const ClientBudgetTracker = () => {
  const total = 12000000;
  const spent = 8200000;
  const contingency = 1000000;
  const remaining = total - spent - contingency;

  const getPercent = (value: number) => `${(value / total) * 100}%`;

  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
      <Text className="text-lg font-bold text-brand-text mb-4">Budget Overview</Text>
      
      {/* Segmented Bar */}
      <View className="h-4 rounded-full flex-row overflow-hidden mb-6">
        <View className="bg-brand-orange h-full" style={{ width: getPercent(spent) }} />
        <View className="bg-brand-success h-full" style={{ width: getPercent(remaining) }} />
        <View className="bg-gray-300 h-full" style={{ width: getPercent(contingency) }} />
      </View>
      
      {/* Legend */}
      <View className="flex-row justify-between">
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <View className="w-3 h-3 rounded-full bg-brand-orange mr-2" />
            <Text className="text-gray-500 text-xs uppercase font-semibold">Spent</Text>
          </View>
          <Text className="text-brand-text font-bold">Rs. 8.2M</Text>
        </View>
        
        <View className="flex-1 items-center">
          <View className="flex-row items-center mb-1">
            <View className="w-3 h-3 rounded-full bg-brand-success mr-2" />
            <Text className="text-gray-500 text-xs uppercase font-semibold">Remaining</Text>
          </View>
          <Text className="text-brand-text font-bold">Rs. 2.8M</Text>
        </View>
        
        <View className="flex-1 items-end">
          <View className="flex-row items-center mb-1">
            <View className="w-3 h-3 rounded-full bg-gray-300 mr-2" />
            <Text className="text-gray-500 text-xs uppercase font-semibold">Contingency</Text>
          </View>
          <Text className="text-brand-text font-bold">Rs. 1.0M</Text>
        </View>
      </View>
    </View>
  );
};
