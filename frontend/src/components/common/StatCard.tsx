import React from 'react';
import { View, Text } from 'react-native';

import { useResponsive } from '../../hooks/useResponsive';

export type IndicatorType = 'success' | 'warning' | 'danger' | 'neutral';

interface StatCardProps {
  label: string;
  value: string | number;
  indicatorText?: string;
  indicatorType?: IndicatorType;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const StatCard = ({ label, value, indicatorText, indicatorType = 'neutral', icon, fullWidth }: StatCardProps) => {
  const { isPhone } = useResponsive();

  const getIndicatorColor = () => {
    switch (indicatorType) {
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'danger':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <View className={`bg-white rounded-lg p-4 md:p-5 shadow-sm border border-gray-100 ${fullWidth ? 'w-full h-full' : isPhone ? 'w-full mb-3' : 'flex-1 mx-1 md:mx-2 mb-3 md:mb-0'}`}>
      <View className="flex-row justify-between items-start mb-2">
        <Text className="flex-1 min-w-0 pr-2 text-brand-text-muted text-xs font-semibold uppercase">{label}</Text>
        {icon ? (
          <View>{icon}</View>
        ) : (
          <View className="w-4 h-4 bg-gray-200 rounded-full" />
        )}
      </View>
      
      <Text className="text-2xl md:text-3xl font-bold text-brand-text mb-2" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      
      <View className="flex-row items-center mt-auto">
        <Text className={`text-xs font-medium ${getIndicatorColor()}`}>
          {indicatorText}
        </Text>
      </View>
    </View>
  );
};
