import React from 'react';
import { View, Text, Pressable } from 'react-native';

export const NotificationCard = ({
  title,
  subtitle,
  iconFamily: IconFamily,
  iconName,
  iconColor,
  isUnread = false,
  actionLabel = 'View'
}: {
  title: string,
  subtitle: string,
  iconFamily: any,
  iconName: string,
  iconColor: string,
  isUnread?: boolean,
  actionLabel?: string
}) => {
  return (
    <View className={`bg-white rounded-lg p-4 mb-3 flex-row items-center border ${isUnread ? 'border-l-4 border-l-brand-orange border-y-gray-100 border-r-gray-100' : 'border-gray-100'}`}>
      {/* Icon Area */}
      <View className="relative mr-4">
        <View className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 items-center justify-center">
          <IconFamily name={iconName} size={18} color={iconColor} />
        </View>
        {isUnread && (
          <View className="absolute -top-1 -right-1 w-3 h-3 bg-brand-orange rounded-full border-2 border-white" />
        )}
      </View>

      {/* Content Area */}
      <View className="flex-1">
        <Text className="text-brand-text font-bold text-base mb-0.5">{title}</Text>
        <Text className="text-gray-500 text-sm">{subtitle}</Text>
      </View>

      {/* Action Area */}
      <Pressable className="border border-gray-300 px-4 py-2 rounded-lg ml-4">
        <Text className="text-gray-600 font-semibold text-sm">{actionLabel}</Text>
      </Pressable>
    </View>
  );
};
