import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {
  formatPhoneAsYouType,
  formatSriLankanPhoneLocal,
  normalizeToE164,
  isValidSriLankanPhone,
  LK_PHONE_ERROR_MESSAGE,
} from '@/lib/phone';

export interface PhoneInputProps {
  label?: string;
  value?: string | null;
  onChangePhone?: (e164: string, isValid: boolean, localFormatted: string) => void;
  required?: boolean;
  disabled?: boolean;
  editable?: boolean;
  error?: string | null;
  placeholder?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  className?: string;
  testID?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label = 'Phone Number',
  value,
  onChangePhone,
  required = false,
  disabled = false,
  editable = true,
  error: customError,
  placeholder = '077 123 4567',
  helperText,
  containerStyle,
  inputStyle,
  className = '',
  testID,
}) => {
  // Initialize with local format if value provided (e.g. +9477... -> 077 123 4567)
  const getInitialDisplay = () => {
    if (!value) return '';
    return formatSriLankanPhoneLocal(value);
  };

  const [displayText, setDisplayText] = useState<string>(getInitialDisplay());
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync with external value changes when not focused
  useEffect(() => {
    if (!isFocused) {
      setDisplayText(getInitialDisplay());
    }
  }, [value, isFocused]);

  const handleChangeText = (text: string) => {
    // Progressive auto-formatting as user types
    const formatted = formatPhoneAsYouType(text);
    setDisplayText(formatted);

    // If an error was already visible and user starts correcting, evaluate or clear if valid
    const valid = isValidSriLankanPhone(formatted);
    const e164 = normalizeToE164(formatted) || '';

    if (touched) {
      if (formatted.trim() === '') {
        setInternalError(required ? 'Phone number is required' : null);
      } else if (valid) {
        setInternalError(null);
      }
    }

    if (onChangePhone) {
      const isFieldValid = formatted.trim() === '' ? !required : valid;
      onChangePhone(e164, isFieldValid, formatted);
    }
  };

  const handleBlur = () => {
    setIsFocused(true);
    setTouched(true);

    const trimmed = displayText.trim();
    if (trimmed === '') {
      if (required) {
        setInternalError('Phone number is required');
      } else {
        setInternalError(null);
      }
      if (onChangePhone) {
        onChangePhone('', !required, '');
      }
      return;
    }

    const valid = isValidSriLankanPhone(trimmed);
    const e164 = normalizeToE164(trimmed);

    if (!valid || !e164) {
      setInternalError(LK_PHONE_ERROR_MESSAGE);
    } else {
      setInternalError(null);
      // Cleanly format to standard local display: 077 123 4567
      const localClean = formatSriLankanPhoneLocal(e164);
      setDisplayText(localClean);
    }

    if (onChangePhone) {
      onChangePhone(e164 || '', valid, displayText);
    }
  };

  const displayError = customError || internalError;

  return (
    <View style={[styles.container, containerStyle]} className={`mb-4 ${className}`}>
      {label ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={styles.label}
          className="text-sm font-semibold text-gray-700 mb-1"
        >
          {label}
          {required && <Text style={{ color: '#EF4444' }}> *</Text>}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          !!displayError && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
      >
        <View style={styles.countryCodeBadge}>
          <Text maxFontSizeMultiplier={1.3} style={styles.badgeText}>
            🇱🇰 +94
          </Text>
        </View>

        <TextInput
          testID={testID}
          style={[styles.input, inputStyle]}
          value={displayText}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          editable={editable && !disabled}
          keyboardType="phone-pad"
          // @ts-ignore Web inputMode
          inputMode="tel"
          maxLength={14}
          maxFontSizeMultiplier={1.3}
        />
      </View>

      {displayError ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.errorText} className="text-red-500 text-xs mt-1">
          {displayError}
        </Text>
      ) : helperText ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.helperText} className="text-gray-400 text-xs mt-1">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    minHeight: 48,
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: '#F97316',
    backgroundColor: '#FFFFFF',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.7,
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: '100%',
    backgroundColor: '#F3F4F6',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111827',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
