import React from 'react';
import { View, Text, Pressable } from 'react-native';

export function Pagination({ page, pageSize, total, loading, onChange }: { page: number; pageSize: number; total: number; loading: boolean; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <View className="flex-row flex-wrap justify-between items-center gap-3 py-4">
    <Text accessibilityLiveRegion="polite" className="text-xs text-slate-500 dark:text-slate-400">{total === 0 ? '0 orders' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total} orders`}</Text>
    <View className="flex-row items-center gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous page" disabled={loading || page === 0} accessibilityState={{ disabled: loading || page === 0 }} onPress={() => onChange(page - 1)} className={`min-h-11 justify-center px-3 rounded-lg border border-slate-200 dark:border-slate-700 ${loading || page === 0 ? 'opacity-40' : 'bg-white dark:bg-slate-800'}`}><Text className="text-sm text-slate-700 dark:text-slate-200">Previous</Text></Pressable>
      <Text className="text-xs text-slate-500 dark:text-slate-400">{page + 1} / {pages}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next page" disabled={loading || page + 1 >= pages} accessibilityState={{ disabled: loading || page + 1 >= pages }} onPress={() => onChange(page + 1)} className={`min-h-11 justify-center px-3 rounded-lg border border-slate-200 dark:border-slate-700 ${loading || page + 1 >= pages ? 'opacity-40' : 'bg-white dark:bg-slate-800'}`}><Text className="text-sm text-slate-700 dark:text-slate-200">Next</Text></Pressable>
    </View>
  </View>;
}
