import React from 'react';
import { usePathname } from 'expo-router';
import { isDashboardPath } from '@/utils/contentWidth';
import { Pressable, Text, ActivityIndicator, Platform, ViewStyle, TextStyle, useWindowDimensions } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export type ButtonSize = 'default' | 'compact';

interface ButtonProps {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export const Button = ({
  label,
  accessibilityLabel,
  onPress,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  className = '',
  style,
  icon,
}: ButtonProps) => {
  const { width } = useWindowDimensions();
  const dashboard = isDashboardPath(usePathname());
  const isCompact = size === 'compact';

  // Base heights and paddings
  const baseClasses = `flex-row items-center justify-center rounded-xl overflow-hidden ${
    isCompact ? 'min-h-[44px] px-4 py-2' : 'min-h-[48px] px-5 py-3'
  }`;

  // Variant styling
  let variantClasses = '';
  let textClasses = '';
  let spinnerColor = '#ffffff';

  switch (variant) {
    case 'success':
      variantClasses = 'bg-green-700';
      textClasses = 'text-white';
      spinnerColor = '#ffffff';
      break;
    case 'primary':
      variantClasses = 'bg-orange-700';
      textClasses = 'text-white';
      spinnerColor = '#ffffff';
      break;
    case 'secondary':
      variantClasses = 'bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700';
      textClasses = 'text-brand-text dark:text-white';
      spinnerColor = '#F97316';
      break;
    case 'danger':
      variantClasses = 'bg-red-500';
      textClasses = 'text-white';
      spinnerColor = '#ffffff';
      break;
    case 'ghost':
      variantClasses = 'bg-transparent';
      textClasses = 'text-orange-700 dark:text-orange-400';
      spinnerColor = '#F97316';
      break;
  }

  const disabledClasses = disabled || loading ? 'opacity-60' : 'active:opacity-80';

  // Font rendering fixes for Android
  const fontFixes: TextStyle = Platform.OS === 'android' ? {
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: isCompact ? 19 : 20, // 15 + 4, 16 + 4
  } : {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses} ${disabledClasses} ${className}`}
      style={[{ minWidth: 44, maxWidth: '100%', flexShrink: 1, alignSelf: !dashboard && width >= 768 ? 'flex-start' : undefined }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {icon && <React.Fragment>{icon}</React.Fragment>}
          <Text
            maxFontSizeMultiplier={1.3}
            className={`font-semibold text-center ${isCompact ? 'text-[15px]' : 'text-base'} ${textClasses} ${icon ? 'ml-2' : ''}`}
            style={{ flexShrink: 1, minWidth: 0, ...fontFixes }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};
