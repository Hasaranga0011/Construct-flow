import React from 'react';
import { View, Text } from 'react-native';

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const getBadgeStyle = (s: string) => {
    switch (s) {
      case 'Pending Delivery': return 'bg-orange-100 text-orange-700';
      case 'Suggested': return 'bg-yellow-100 text-yellow-700';
      case 'Confirmed': return 'bg-blue-100 text-blue-700';
      case 'Delivered': return 'bg-purple-100 text-purple-700';
      case 'Received': return 'bg-green-100 text-green-700';
      case 'Rejected': return 'bg-red-100 text-red-700';
      case 'Cancelled': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const colorClass = getBadgeStyle(status);
  const [bgClass, textClass] = colorClass.split(' ');

  return (
    <View className={`px-2 py-1 rounded-full ${bgClass} self-start`}>
      <Text numberOfLines={1} className={`text-xs font-bold ${textClass}`}>
        {status || 'Unknown'}
      </Text>
    </View>
  );
}
