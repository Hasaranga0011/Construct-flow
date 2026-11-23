import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVisibleViewport } from '@/hooks/useVisibleViewport';

export function ModalViewport({ children }: { children: React.ReactNode }) {
  const { height, top } = useVisibleViewport();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        flex: Platform.OS === 'web' ? undefined : 1,
        height: Platform.OS === 'web' ? height : undefined,
        width: '100%',
        marginTop: Platform.OS === 'web' ? top : undefined,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Math.max(16, insets.top),
        paddingBottom: Math.max(16, insets.bottom),
        paddingHorizontal: 16,
      }}>
      <View testID="modal-content-viewport" style={{ width: '100%', maxHeight: Math.min(height * 0.85, height - insets.top - insets.bottom - 32), flexShrink: 1, minHeight: 0, alignItems: 'center' }}>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}
