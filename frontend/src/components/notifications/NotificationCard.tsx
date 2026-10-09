import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

export const NotificationCard = ({
  title,
  subtitle,
  iconFamily: IconFamily,
  iconName,
  iconColor,
  isUnread = false,
  actionLabel = 'View',
  onActionPress
}: {
  title: string,
  subtitle: string,
  iconFamily: any,
  iconName: string,
  iconColor: string,
  isUnread?: boolean,
  actionLabel?: string,
  onActionPress?: () => void
}) => {
  const { isMobile } = useResponsive();

  if (isMobile) {
    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: isUnread ? '#F97316' : '#F3F4F6' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <IconFamily name={iconName} size={18} color={iconColor} />
            {isUnread && (
              <View style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, backgroundColor: '#F97316', borderRadius: 6, borderWidth: 2, borderColor: '#fff' }} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#111827', fontWeight: 'bold', fontSize: 15, marginBottom: 2 }]}>{title}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#6B7280', fontSize: 13 }]}>{subtitle}</Text>
          </View>
        </View>
        <Pressable onPress={onActionPress} style={[{ width: '100%', borderWidth: 1, borderColor: '#D1D5DB', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, { minHeight: 44, minWidth: 44 }]}>
          <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#4B5563', fontWeight: '600', fontSize: 13 }]}>{actionLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className={`bg-white rounded-lg p-4 mb-3 flex-row items-center border ${isUnread ? 'border-l-4 border-l-brand-orange border-y-gray-100 border-r-gray-100' : 'border-gray-100'}`}>
      {/* Icon Area */}
      <View className="relative mr-4">
        <View className="w-11 h-11 rounded-full bg-gray-50 border border-gray-100 items-center justify-center">
          <IconFamily name={iconName} size={18} color={iconColor} />
        </View>
        {isUnread && (
          <View className="absolute -top-1 -right-1 w-3 h-3 bg-brand-orange rounded-full border-2 border-white" />
        )}
      </View>

      {/* Content Area */}
      <View className="flex-1">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base mb-0.5">{title}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">{subtitle}</Text>
      </View>

      {/* Action Area */}
      <Pressable onPress={onActionPress} style={{ minHeight: 44, minWidth: 44 }} className="border border-gray-300 px-4 py-2 rounded-lg ml-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 font-semibold text-sm">{actionLabel}</Text>
      </Pressable>
    </View>
  );
};
