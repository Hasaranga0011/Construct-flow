import React from 'react';
import { View, Text, TextInput, TextInputProps, Platform } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const FormField = React.forwardRef<TextInput, FormFieldProps>(({
  label,
  error,
  helperText,
  containerClassName = '',
  className = '',
  onFocus,
  onBlur,
  style,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <View className={`mb-4 ${containerClassName}`}>
      <Text
        maxFontSizeMultiplier={1.3}
        className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
      >
        {label}
      </Text>
      <TextInput
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel || label}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor="#64748B"
        maxFontSizeMultiplier={1.3}
        className={`min-h-[48px] px-4 rounded-xl border text-base text-brand-text dark:text-white bg-gray-50 dark:bg-[#1E293B]
          ${error ? 'border-red-500' : isFocused ? 'border-brand-orange' : 'border-gray-300 dark:border-gray-700'}
          ${Platform.OS === 'web' ? 'outline-none transition-colors' : ''}
          ${className}`}
        style={[{ minWidth: 0 }, Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {}, style]}
      />
      {error ? (
        <Text accessibilityRole="alert" maxFontSizeMultiplier={1.3} className="text-xs text-red-700 mt-1.5 font-medium">{error}</Text>
      ) : helperText ? (
        <Text maxFontSizeMultiplier={1.3} className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{helperText}</Text>
      ) : null}
    </View>
  );
});

FormField.displayName = 'FormField';

