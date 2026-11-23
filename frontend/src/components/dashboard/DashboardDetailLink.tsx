import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Static panels are whole-card links; panels with controls get a separate link. */
export function DashboardDetailLink({ href, label, children, interactive = false }: {
  href: string; label: string; children: React.ReactNode; interactive?: boolean;
}) {
  const cue = <View className="flex-row items-center justify-end gap-1 py-2 px-1">
    <Text className="text-xs font-semibold text-brand-orange">Open {label}</Text>
    <Ionicons name="arrow-forward" size={14} color="#ea580c" />
  </View>;
  // A zero flex basis collapses long panels in vertical scroll layouts. Keep
  // intrinsic content height while still sharing space in desktop rows.
  const panelStyle = { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' as const, minWidth: 0 };
  if (interactive) return <View testID="dashboard-detail-panel" style={panelStyle}>
    <Link href={href as Href} asChild><Pressable accessibilityRole="link" accessibilityLabel={`Open ${label} details`} testID="dashboard-panel-link" style={{ minHeight: 44, justifyContent: 'center' }}>{cue}</Pressable></Link>
    {children}
  </View>;
  return <Link href={href as Href} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${label} details`} testID="dashboard-panel-link" style={panelStyle} className="active:opacity-80">
      {children}{cue}
    </Pressable>
  </Link>;
}
