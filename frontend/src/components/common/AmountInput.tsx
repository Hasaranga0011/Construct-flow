import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from 'react-native';
import {
  formatAmountLive,
  parseAmount,
  formatCompactCurrency,
  formatAmount,
  CURRENCY_PREFIX,
} from '@/lib/amount';

export interface AmountInputProps {
  label?: string;
  value?: number | string | null;
  onChangeValue?: (value: number | null, formatted: string) => void;
  allowDecimals?: boolean;
  maxDecimals?: number;
  prefix?: string;
  placeholder?: string;
  disabled?: boolean;
  editable?: boolean;
  required?: boolean;
  error?: string | null;
  helperText?: string;
  showCompactHelper?: boolean; // Shows Rs. 1.25M under field for large amounts
  min?: number;
  max?: number;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  className?: string;
  testID?: string;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  label,
  value,
  onChangeValue,
  allowDecimals = true,
  maxDecimals = 2,
  prefix = 'Rs.',
  placeholder = '0',
  disabled = false,
  editable = true,
  required = false,
  error: customError,
  helperText,
  showCompactHelper = true,
  min,
  max,
  containerStyle,
  inputStyle,
  className = '',
  testID,
}) => {
  // Format initial value
  const getInitialDisplay = () => {
    if (value === null || value === undefined || value === '') return '';
    return formatAmount(value, {
      decimals: allowDecimals ? (Number.isInteger(Number(value)) ? 0 : maxDecimals) : 0,
    });
  };

  const [displayText, setDisplayText] = useState<string>(getInitialDisplay());
  const [internalError, setInternalError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<any>(null);

  // Sync when external controlled value changes (and not currently focused/typing)
  useEffect(() => {
    if (!isFocused) {
      setDisplayText(getInitialDisplay());
    }
  }, [value, isFocused]);

  const handleChangeText = (text: string) => {
    // Format live
    const { formatted, rawNumber } = formatAmountLive(text, {
      allowDecimals,
      maxDecimals,
    });

    setDisplayText(formatted);

    // Validation
    let err: string | null = null;
    if (required && rawNumber === null) {
      err = 'This field is required';
    } else if (rawNumber !== null) {
      if (min !== undefined && rawNumber < min) {
        err = `Amount cannot be less than ${formatAmount(min)}`;
      } else if (max !== undefined && rawNumber > max) {
        err = `Amount cannot exceed ${formatAmount(max)}`;
      }
    }
    setInternalError(err);

    if (onChangeValue) {
      onChangeValue(rawNumber, formatted);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseAmount(displayText);

    if (required && parsed === null) {
      setInternalError('This field is required');
    } else if (parsed !== null && min !== undefined && parsed < min) {
      setInternalError(`Amount cannot be less than ${formatAmount(min)}`);
    } else {
      setInternalError(null);
    }

    // Format cleanly on blur (e.g. drop trailing dot if present)
    if (parsed !== null) {
      const cleanFormatted = formatAmount(parsed, {
        decimals: allowDecimals && !Number.isInteger(parsed) ? maxDecimals : 0,
      });
      setDisplayText(cleanFormatted);
    }
  };

  const currentNumericValue = parseAmount(displayText);
  const displayError = customError || internalError;

  // Show helper line for large numbers (>= 10,000) so mistakes with extra zeros are obvious
  const compactDisplay =
    showCompactHelper && currentNumericValue && Math.abs(currentNumericValue) >= 10_000
      ? `${prefix ? prefix + ' ' : ''}${formatCompactCurrency(currentNumericValue).replace('Rs. ', '')}`
      : null;

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
        {prefix ? (
          <View style={styles.prefixContainer}>
            <Text maxFontSizeMultiplier={1.3} style={styles.prefixText}>
              {prefix}
            </Text>
          </View>
        ) : null}

        <TextInput
          ref={inputRef}
          testID={testID}
          style={[styles.input, inputStyle]}
          value={displayText}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          editable={editable && !disabled}
          keyboardType="numeric"
          // @ts-ignore Web inputMode attribute
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          maxFontSizeMultiplier={1.3}
        />
      </View>

      {/* Helper line / inline errors */}
      {displayError ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.errorText} className="text-red-500 text-xs mt-1">
          {displayError}
        </Text>
      ) : compactDisplay || helperText ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.helperText} className="text-gray-400 text-xs mt-1">
          {compactDisplay ? `Value: ${compactDisplay}` : helperText}
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
  prefixContainer: {
    paddingLeft: 14,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
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
