import React from 'react';
import { View, Text } from 'react-native';

const tones: Record<string, { background: string; foreground: string }> = {
  success: { background: 'bg-green-100', foreground: 'text-green-800' },
  warning: { background: 'bg-orange-100', foreground: 'text-orange-800' },
  info: { background: 'bg-blue-100', foreground: 'text-blue-800' },
  danger: { background: 'bg-red-100', foreground: 'text-red-800' },
  neutral: { background: 'bg-slate-100', foreground: 'text-slate-700' },
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status?.trim() || 'Not recorded';
  const normalized = value.toLowerCase().replace(/_/g, ' ');
  const tone = ['received', 'completed', 'paid', 'approved', 'resolved', 'present', 'in stock'].includes(normalized) ? 'success'
    : ['rejected', 'overdue', 'absent', 'high', 'critical', 'out of stock'].includes(normalized) ? 'danger'
    : ['confirmed', 'in progress', 'active', 'delivered'].includes(normalized) ? 'info'
    : ['pending', 'pending delivery', 'pending approval', 'suggested', 'generated', 'planning', 'open', 'low stock', 'on leave'].includes(normalized) ? 'warning' : 'neutral';
  return <View testID="status-badge" accessibilityLabel={value} className={`px-3 py-1.5 rounded-full self-start shrink-0 ${tones[tone].background}`}>
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold shrink-0 ${tones[tone].foreground}`}>{value}</Text>
  </View>;
}
