import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export const ClientBudgetRing = ({ spent, total }: { spent: number; total: number }) => {
  const { isDark } = useTheme();
  const percentage = Number.isFinite(total) && total > 0 && Number.isFinite(spent) ? Math.max(0, Math.round(spent / total * 100)) : null;
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  const progress = percentage == null ? 0 : Math.min(100, percentage);
  const color = percentage != null && percentage > 100 ? '#ef4444' : '#f97316';
  return <View accessibilityLabel={percentage == null ? 'Project budget not set' : 'Project budget used: ' + percentage + '%'} className="w-24 h-24 items-center justify-center shrink-0">
    <Svg width={96} height={96} viewBox="0 0 96 96">
      <Circle cx={48} cy={48} r={radius} stroke={isDark ? '#334155' : '#f1f5f9'} strokeWidth={7} fill="none" />
      {progress > 0 && <Circle cx={48} cy={48} r={radius} stroke={color} strokeWidth={7} fill="none" strokeDasharray={[circumference, circumference]} strokeDashoffset={circumference * (1 - progress / 100)} strokeLinecap="round" rotation={-90} origin="48, 48" />}
    </Svg>
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <Text className="text-lg font-bold text-slate-900 dark:text-white">{percentage == null ? '—' : percentage + '%'}</Text>
      <Text className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{percentage == null ? 'No budget' : 'Used'}</Text>
    </View>
  </View>;
};
