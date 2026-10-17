import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending = false,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatComposerProps) {
  const insets = useSafeAreaInsets();
  const [isFocused, setIsFocused] = useState(false);

  const trimmed = value.trim();
  const isSendDisabled = disabled || sending || trimmed.length === 0;

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS === 'web') {
      const nativeEvent = e.nativeEvent as any;
      if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
        // Prevent default newline and send
        e.preventDefault?.();
        if (!isSendDisabled) {
          onSend();
        }
      }
    }
  };

  const bottomInset = Platform.OS === 'ios' ? Math.max(12, insets.bottom) : 12;

  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: bottomInset,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 4,
        },
      ]}
      className="flex-row items-end"
    >
      <View
        style={[
          {
            flex: 1,
            backgroundColor: '#F9FAFB',
            borderWidth: 1.5,
            borderColor: isFocused ? '#EA580C' : '#D1D5DB',
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: Platform.OS === 'ios' ? 8 : 4,
            minHeight: 48,
            maxHeight: 120,
            marginRight: 10,
            justifyContent: 'center',
          },
        ]}
      >
        <TextInput
          accessibilityLabel="Message input"
          maxFontSizeMultiplier={1.3}
          style={{
            flex: 1,
            fontSize: 16, // >=16px prevents iOS Safari auto-zoom
            color: '#111827',
            maxHeight: 104,
            paddingTop: Platform.OS === 'android' ? 4 : 0,
            paddingBottom: Platform.OS === 'android' ? 4 : 0,
          }}
          multiline
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          editable={!disabled && !sending}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyPress={handleKeyPress}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        onPress={onSend}
        disabled={isSendDisabled}
        style={[
          {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: isSendDisabled ? '#E5E7EB' : '#EA580C',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: isSendDisabled ? 'transparent' : '#EA580C',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isSendDisabled ? 0 : 0.25,
            shadowRadius: 3,
            elevation: isSendDisabled ? 0 : 3,
          },
        ]}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons
            name="send"
            size={20}
            color={isSendDisabled ? '#9CA3AF' : '#FFFFFF'}
            style={{ marginLeft: 2 }}
          />
        )}
      </Pressable>
    </View>
  );
}

export default ChatComposer;
