import React from 'react';
import { View, Text } from 'react-native';

export const ClientBudgetRing = ({ spent, total }: { spent: number, total: number }) => {
  const percentage = Math.min(100, Math.round((spent / total) * 100));
  
  return (
    <View className="items-center justify-center">
      <View className="w-24 h-24 rounded-full border-8 border-gray-100 items-center justify-center relative">
        <View 
          className="absolute inset-0 rounded-full border-8 border-brand-orange"
          style={{ 
            borderTopColor: '#F97316', 
            borderRightColor: percentage > 25 ? '#F97316' : 'transparent',
            borderBottomColor: percentage > 50 ? '#F97316' : 'transparent',
            borderLeftColor: percentage > 75 ? '#F97316' : 'transparent',
            transform: [{ rotate: '-45deg' }]
          }} 
        />
        <View className="items-center z-10" style={{ transform: [{ rotate: '45deg' }] }}>
          <Text className="text-xl font-bold text-brand-text">{percentage}%</Text>
          <Text className="text-[10px] text-gray-500 uppercase">Used</Text>
        </View>
      </View>
    </View>
  );
};
