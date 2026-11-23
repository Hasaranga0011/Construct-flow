import React from 'react';
import { View, Text } from 'react-native';
import { statusDisplay } from '@/utils/statusDisplay';

const tones: Record<string, { background: string; foreground: string }> = {
  success: { background: 'bg-green-100', foreground: 'text-green-800' },
  warning: { background: 'bg-orange-100', foreground: 'text-orange-800' },
  info: { background: 'bg-blue-100', foreground: 'text-blue-800' },
  danger: { background: 'bg-red-100', foreground: 'text-red-800' },
  neutral: { background: 'bg-slate-100', foreground: 'text-slate-700' },
};
export function StatusBadge({ status, fullWidth=false }: { status: string | null | undefined; fullWidth?:boolean }) {
  const value = statusDisplay(status);
  const normalized = value.toLowerCase().replace(/_/g, ' ');
  const tone = ['received', 'completed', 'paid', 'approved', 'resolved', 'present', 'in stock', 'checked out', 'closed'].includes(normalized) ? 'success'
    : ['rejected', 'overdue', 'absent', 'high', 'critical', 'out of stock'].includes(normalized) ? 'danger'
    : ['confirmed', 'in progress', 'active', 'delivered', 'checked in', 'on site'].includes(normalized) ? 'info'
    : ['pending', 'pending delivery', 'pending approval', 'suggested', 'generated', 'planning', 'open', 'low stock', 'on leave', 'on hold', 'check-out missing', 'not started'].includes(normalized) ? 'warning' : 'neutral';
  return <View testID="status-badge" accessibilityLabel={value} className={`px-3 py-1.5 min-h-[28px] rounded-full justify-center shrink-0 ${fullWidth?'w-full self-stretch items-center':'self-start'} ${tones[tone].background}`}>
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className={`text-xs leading-4 font-semibold shrink-0 ${tones[tone].foreground}`}>{value}</Text>
  </View>;
}
