import React from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
  style?: ViewStyle;
}

export const ScreenContainer = ({ children, scroll = true, className = '', style }: ScreenContainerProps) => {
  const { isDark } = useTheme();

  const content = scroll ? (
    <ScrollView 
      keyboardShouldPersistTaps="handled" 
      className="flex-1 px-4 md:px-8 py-6"
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1 px-4 md:px-8 py-6">{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className={`flex-1 ${className}`}
        style={style}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
