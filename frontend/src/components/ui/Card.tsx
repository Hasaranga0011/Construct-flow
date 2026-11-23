import React from 'react';
import { usePathname } from 'expo-router';
import { isDashboardPath } from '@/utils/contentWidth';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

export const Card = ({ children, className = '', style }: CardProps) => {
  const { isDark } = useTheme();
  const dashboard = isDashboardPath(usePathname());
  
  return (
    <View
      className={dashboard
        ? `rounded-xl p-4 md:p-6 mb-4 ${isDark ? 'bg-[#1E293B] border border-gray-800 shadow-none' : 'bg-white border border-gray-100 shadow-sm'} ${className}`
        : `rounded-2xl p-4 md:p-6 mb-4 border ${className}`}
      style={dashboard ? style : [{
        minWidth: 0,
        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        borderColor: isDark ? '#334155' : '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOpacity: isDark ? 0 : 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 },
        elevation: isDark ? 0 : 1,
      }, style]}
    >
      {children}
    </View>
  );
};
