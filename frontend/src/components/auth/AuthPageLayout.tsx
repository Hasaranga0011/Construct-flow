import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AuthPageLayoutProps = {
  children: React.ReactNode;
  hero: React.ReactNode;
};

export default function AuthPageLayout({ children, hero }: AuthPageLayoutProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportHeight = Math.max(0, height - insets.top - insets.bottom);
  const showHero = width >= 1024;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, minHeight: 0, width: '100%', backgroundColor: '#fff' }}
    >
      <ScrollView
        testID="auth-page-scroll"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ minHeight: viewportHeight, flexDirection: 'row' }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Let content set the page height before centering, so the logo never clips. */}
        <View style={{
          width: showHero ? '50%' : '100%',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: width < 768 ? 24 : 48,
          paddingVertical: 32,
        }}>
          <View style={{ width: '100%', maxWidth: 448, flexShrink: 0 }}>
            {children}
          </View>
        </View>
        {showHero && hero}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
