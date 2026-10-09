import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';

export const LoadingState = ({ message = 'Loading...' }: { message?: string }) => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-12 h-12 rounded-full items-center justify-center mb-4 bg-orange-50 dark:bg-orange-900/20">
      <Ionicons name="sync" size={24} color="#F97316" className="animate-spin" />
    </View>
    <Text maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 font-medium">{message}</Text>
  </View>
);

export const ErrorState = ({ message, onRetry }: { message: string, onRetry?: () => void }) => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-16 h-16 rounded-full items-center justify-center mb-5 bg-red-50 dark:bg-red-900/20">
      <Ionicons name="alert-circle" size={32} color="#EF4444" />
    </View>
    <Text maxFontSizeMultiplier={1.3} className="text-gray-800 dark:text-white font-bold text-lg mb-2 text-center">Something went wrong</Text>
    <Text maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">{message}</Text>
    {onRetry && <Button label="Try Again" onPress={onRetry} variant="secondary" icon={<Ionicons name="refresh" size={18} color="currentColor" />} />}
  </View>
);

export const EmptyState = ({ title, message, icon = 'folder-open-outline', action }: { title: string, message: string, icon?: any, action?: React.ReactNode }) => (
  <View className="flex-1 items-center justify-center p-8 py-12">
    <View className="w-20 h-20 rounded-full items-center justify-center mb-5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
      <Ionicons name={icon} size={36} color="#9CA3AF" />
    </View>
    <Text maxFontSizeMultiplier={1.3} className="text-gray-800 dark:text-white font-bold text-lg mb-2 text-center">{title}</Text>
    <Text maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">{message}</Text>
    {action}
  </View>
);
