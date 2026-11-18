import React from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export function InlineNotice({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' | 'info' }) {
  if (!message) return null;
  const colors = tone === 'error' ? 'bg-red-50 border-red-200' : tone === 'success' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200';
  const text = tone === 'error' ? 'text-red-800' : tone === 'success' ? 'text-green-800' : 'text-blue-800';
  return <View className={`flex-row items-start border rounded-xl p-4 mb-4 ${colors}`} accessibilityLiveRegion="polite">
    <Ionicons name={tone === 'error' ? 'alert-circle-outline' : tone === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={20} color={tone === 'error' ? '#991B1B' : tone === 'success' ? '#166534' : '#1E40AF'} />
    <Text accessibilityRole={tone === 'error' ? 'alert' : undefined} className={`flex-1 ml-3 text-sm leading-5 ${text}`}>{message}</Text>
  </View>;
}
