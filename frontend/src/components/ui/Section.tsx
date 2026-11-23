import React from 'react';
import { View, Text, ViewStyle } from 'react-native';

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  action?: React.ReactNode;
}

export const Section = ({ title, subtitle, children, className = '', style, action }: SectionProps) => {
  return (
    <View className={`mb-6 ${className}`} style={style}>
      <View className="flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <View className="min-w-0 md:flex-1 md:pr-4">
          <Text maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 dark:text-white">{title}</Text>
          {subtitle && (
            <Text maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</Text>
          )}
        </View>
        {action && <View className="max-w-full self-start">{action}</View>}
      </View>
      {children}
    </View>
  );
};
