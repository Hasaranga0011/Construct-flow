import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, useWindowDimensions } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AuthPageLayoutProps = {
  children: React.ReactNode;
  hero: React.ReactNode;
};

export default function AuthPageLayout({ children, hero }: AuthPageLayoutProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  // Static HTML and the first browser render must have the same structure.
  // Apply viewport-dependent panels only after hydration resolves real dimensions.
  const dimensionsReady = Platform.OS !== 'web' || hydrated;
  const viewportHeight = dimensionsReady ? Math.max(0, height - insets.top - insets.bottom) : 0;
  const showHero = dimensionsReady && width >= 1024;

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
          paddingHorizontal: !dimensionsReady || width < 768 ? 24 : 48,
          paddingVertical: 32,
        }}>
          <View style={{ width: '100%', maxWidth: 448, flexShrink: 1 }}>
            {children}
          </View>
        </View>
        {showHero && hero}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
