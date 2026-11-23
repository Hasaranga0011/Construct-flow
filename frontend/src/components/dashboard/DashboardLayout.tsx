import React from 'react';
import type { ScrollView as ScrollViewHandle } from 'react-native';
import { View, Text, Pressable } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/context/ThemeContext';
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications';

type IconName = keyof typeof Ionicons.glyphMap;
export type DashboardAction = { label: string; description: string; icon: IconName; onPress: () => void };
export { DashboardHero } from './DashboardHero';

export function DashboardContent({ children, scrollRef }: { children: React.ReactNode; scrollRef?: React.Ref<ScrollViewHandle> }) {
  return <ScrollView ref={scrollRef} accessibilityLabel="Dashboard workspace" keyboardShouldPersistTaps="handled" className="flex-1 bg-slate-50 dark:bg-slate-950" contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
    <View className="w-full max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 min-w-0"><DashboardNotifications/>{children}</View>
  </ScrollView>;
}

export function DashboardSectionHeading({ title, description, icon }: { title: string; description?: string; icon?: IconName }) {
  const { isDark } = useTheme();
  return <View className="flex-row items-start gap-3 mb-4 min-w-0">
    {icon && <View className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 items-center justify-center"><Ionicons name={icon} size={17} color={isDark ? '#fdba74' : '#c2410c'} /></View>}
    <View className="flex-1 min-w-0">
      <Text accessibilityRole="header" className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100">{title}</Text>
      {!!description && <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{description}</Text>}
    </View>
  </View>;
}

export function DashboardActions({ actions }: { actions: DashboardAction[] }) {
  const { isDark } = useTheme();
  return <View className="mb-6">
    <DashboardSectionHeading title="Quick actions" description="The tools you need, one step away." />
    <View className="flex-row flex-wrap gap-3">
      {actions.map(action => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress}
        className="w-full sm:w-[48%] xl:w-[32%] min-w-0 flex-row items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-slate-800 active:bg-orange-50">
        <View className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950 items-center justify-center"><Ionicons name={action.icon} size={20} color={isDark ? '#fdba74' : '#c2410c'} /></View>
        <View className="flex-1 min-w-0"><Text className="text-sm font-bold text-slate-800 dark:text-slate-100">{action.label}</Text><Text className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{action.description}</Text></View>
        <Ionicons name="arrow-forward-outline" size={16} color="#94a3b8" />
      </Pressable>)}
    </View>
  </View>;
}
