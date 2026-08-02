import React from 'react';
import { View, Text } from 'react-native';

export type IndicatorType = 'success' | 'warning' | 'danger' | 'neutral';

interface StatCardProps {
  label: string;
  value: string | number;
  indicatorText: string;
  indicatorType?: IndicatorType;
  icon?: React.ReactNode;
}

export const StatCard = ({ label, value, indicatorText, indicatorType = 'neutral', icon }: StatCardProps) => {
  const getIndicatorColor = () => {
    switch (indicatorType) {
      case 'success':
        return 'text-brand-success';
      case 'warning':
        return 'text-brand-warning';
      case 'danger':
        return 'text-brand-danger';
      default:
        return 'text-brand-text-muted';
    }
  };

  return (
    <View className="bg-white rounded-lg p-5 flex-1 mx-2 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-brand-text-muted text-xs font-semibold uppercase">{label}</Text>
        {icon ? (
          <View>{icon}</View>
        ) : (
          <View className="w-4 h-4 bg-gray-200 rounded-full" />
        )}
      </View>
      
      <Text className="text-3xl font-bold text-brand-text mb-2">{value}</Text>
      
      <View className="flex-row items-center mt-auto">
        <Text className={`text-xs font-medium ${getIndicatorColor()}`}>
          {indicatorText}
        </Text>
      </View>
    </View>
  );
};
