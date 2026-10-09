import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

export const Card = ({ children, className = '', style }: CardProps) => {
  const { isDark } = useTheme();
  
  return (
    <View
      className={`rounded-xl p-4 md:p-6 mb-4
        ${isDark 
          ? 'bg-[#1E293B] border border-gray-800 shadow-none' 
          : 'bg-white border border-gray-100 shadow-sm'} 
        ${className}`}
      style={style}
    >
      {children}
    </View>
  );
};
