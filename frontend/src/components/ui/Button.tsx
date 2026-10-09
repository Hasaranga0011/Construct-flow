import React from 'react';
import { Pressable, Text, ActivityIndicator, Platform, ViewStyle, TextStyle } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'default' | 'compact';

interface ButtonProps {
  label: string;
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
  onPress,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  className = '',
  style,
  icon,
}: ButtonProps) => {
  const isCompact = size === 'compact';
  
  // Base heights and paddings
  const baseClasses = `flex-row items-center justify-center rounded-xl overflow-hidden ${
    isCompact ? 'min-h-[44px] px-4' : 'min-h-[48px] px-5'
  }`;

  // Variant styling
  let variantClasses = '';
  let textClasses = '';
  let spinnerColor = '#ffffff';

  switch (variant) {
    case 'primary':
      variantClasses = 'bg-brand-orange';
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
      textClasses = 'text-brand-orange';
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
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses} ${disabledClasses} ${className}`}
      style={style}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {icon && <React.Fragment>{icon}</React.Fragment>}
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={2}
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
