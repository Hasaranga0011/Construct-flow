import React from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/context/ThemeContext';

/** Shared portal introduction: content leads, with no decorative banner artwork. */
export function DashboardHero({ eyebrow, title, description, icon }: {
  eyebrow: string; title: string; description: string; icon: keyof typeof Ionicons.glyphMap;
}) {
  const { isDark } = useTheme();
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Colombo' });
  return <View accessibilityLabel={`${eyebrow} overview`} className="mb-6 border-b border-slate-200 dark:border-slate-800 pb-6 pt-1">
    <View className="flex-row flex-wrap items-center justify-between gap-3 mb-3">
      <View className="flex-row items-center gap-2 min-w-0 flex-shrink">
        <Ionicons name={icon} size={15} color={isDark ? '#fb923c' : '#c2410c'} />
        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex-shrink">{eyebrow}</Text>
      </View>
      <Text className="text-xs text-slate-500 dark:text-slate-400">{date}</Text>
    </View>
    <Text accessibilityRole="header" className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 leading-tight mb-2">{title}</Text>
    <Text className="text-sm leading-6 text-slate-500 dark:text-slate-400 max-w-2xl">{description}</Text>
  </View>;
}
