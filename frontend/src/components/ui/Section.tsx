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
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-1 pr-4">
          <Text maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 dark:text-white">{title}</Text>
          {subtitle && (
            <Text maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</Text>
          )}
        </View>
        {action && <View>{action}</View>}
      </View>
      {children}
    </View>
  );
};
