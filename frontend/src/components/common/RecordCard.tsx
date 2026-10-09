import React from 'react';
import { Pressable, Text, View } from 'react-native';
export function RecordCard({ title, fields, action }: { title: string; fields: { label: string; value: React.ReactNode }[]; action?: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean } }) {
  return <View className="w-full min-w-0 rounded-lg border border-gray-100 bg-white p-4 mb-3">
    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text mb-3">{title}</Text>
    {fields.map(field => <View key={field.label} className="mb-2 min-w-0"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">{field.label}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700">{field.value}</Text></View>)}
    {action && <Pressable accessibilityLabel={action.accessibilityLabel || action.label} accessibilityRole="button" disabled={action.disabled} onPress={action.onPress} className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-orange-50 px-4 py-3 mt-2"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-semibold">{action.label}</Text></Pressable>}
  </View>;
}
