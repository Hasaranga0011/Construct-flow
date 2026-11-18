import '../global.css';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, Pressable, KeyboardAvoidingView, Platform, LogBox } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ToastProvider } from '../components/common/ToastProvider';
import { NotificationProvider } from '../context/NotificationContext';
import { PageMetadata } from '../components/common/PageMetadata';

import { normalizeRole } from '../utils/auth';
import { supabase } from '../lib/supabase';
import { cleanupLegacyRememberedKeys } from '../lib/rememberedEmail';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Ignore React Native logs for Reanimated strict mode
LogBox.ignoreLogs(['[Reanimated] Reading from `value`']);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Disables strict mode warnings for Reanimated
});

// Remove pre-"login.rememberedEmail" keys so stale emails stop appearing anywhere.
cleanupLegacyRememberedKeys();

const DASHBOARD_MAP: Record<string, string> = {
  admin: '/admin/dashboard',
  pm: '/pm/dashboard',
  site_manager: '/site-manager/dashboard',
  client: '/client/dashboard',
  worker: '/worker/dashboard',
  supplier: '/supplier/dashboard',
};

const AUTH_PAGES = ['register', 'team-login', 'team-register', 'partner-login', 'partner-register', 'admin-login', 'forgot-password', 'reset-password'];
const ROLE_PORTALS = ['admin', 'pm', 'site-manager', 'client', 'worker', 'supplier'];

function InitialLayout() {
  const { session, role, isLoading, isApproved, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [hasMounted, setHasMounted] = useState(Platform.OS !== 'web');
  useEffect(() => { setHasMounted(true); }, []);

  usePushNotifications(session?.user?.id || null);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (isLoading) return;

    const firstSegment = (segments as string[])[0] ?? '';
    if (session && !isApproved && firstSegment !== 'pending-approval' && firstSegment !== 'reset-password') {
      router.replace('/pending-approval');
      return;
    }
    const inAuthPage = AUTH_PAGES.includes(firstSegment);
    const inRolePortal = ROLE_PORTALS.includes(firstSegment);
    const inLanding = firstSegment === '';

    if (!session && inRolePortal) {
      router.replace('/team-login');
      return;
    }

    // Session exists — need to route to dashboard.
    // Use role from AuthContext; if it's null, fetch it ourselves as fallback.
    // Exception: never redirect away from reset-password.
    if (session && (inAuthPage || inLanding) && firstSegment !== 'reset-password') {

      const routeWithRole = (resolvedRole: string | null) => {
        const normalized = normalizeRole(resolvedRole);
        // Just route to dashboard based on role, regardless of which login page was used
        const dest = DASHBOARD_MAP[normalized ?? ''];
        if (dest) {
          router.replace(dest as any);
        }
      };

      if (role) {
        // Role already resolved in AuthContext
        routeWithRole(role);
        return;
      }

      // Role is null — fetch from profiles table directly as a fallback
      supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
        .then(({ data: profile }) => {
          const profileRole = profile?.role;
          const resolvedRole = profileRole ?? null;
          routeWithRole(resolvedRole);
        });
      return;
    }



    if (session && inRolePortal && role) {
      const expectedPortal = normalizeRole(role) === 'site_manager' ? 'site-manager' : normalizeRole(role);
      if (expectedPortal && firstSegment !== expectedPortal) {
        const dest = DASHBOARD_MAP[normalizeRole(role) ?? ''];
        if (dest) router.replace(dest as any);
        return;
      }
    }

  }, [session, role, isLoading, isApproved, segments, rootNavigationState, router]);


  // Login/register pages: always render the SAME tree (Slot + optional spinner
  // overlay). Swapping wrappers remounts the page — that reset navigation to "/"
  // and wiped the login form and the Access Denied popup.
  // Expo's server render can have no segments while the browser already knows
  // the auth route. Keep the initial tree identical before rendering its Slot.
  if (!hasMounted) {
    return <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center">
      <ActivityIndicator size="large" color="#F97316" />
    </View>;
  }
  const currentSegment = (segments as string[])[0] ?? '';
  if (AUTH_PAGES.includes(currentSegment)) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, minHeight: 0 }} behavior={undefined}>
        <Slot />
        {isLoading ? (
          <View
            pointerEvents="auto"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' }}
          >
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  const firstSegment = (segments as string[])[0] ?? '';
  const inRolePortal = ROLE_PORTALS.includes(firstSegment);

  if (session && inRolePortal && !DASHBOARD_MAP[normalizeRole(role) ?? '']) {
    return <View className="flex-1 items-center justify-center p-6 bg-white">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg text-gray-900 mb-4">Your account does not have an authorized role. Contact your administrator.</Text>
      <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => void signOut()} className="bg-brand-orange px-6 py-3 rounded-lg"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white">Sign out</Text></Pressable>
    </View>;
  }
  const expectedPortal = normalizeRole(role) === 'site_manager' ? 'site-manager' : normalizeRole(role);
  if (inRolePortal && (!session || !isApproved || firstSegment !== expectedPortal)) {
    return (
      <View className="flex-1 bg-brand-light dark:bg-[#0F172A] items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return <KeyboardAvoidingView style={{ flex: 1, minHeight: 0 }} behavior={inRolePortal && Platform.OS !== 'web' ? Platform.OS === 'ios' ? 'padding' : 'height' : undefined}><Slot />{null}</KeyboardAvoidingView>;
}

export default function RootLayout() {


  return (
    <SafeAreaProvider>
      <PageMetadata />
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }}>
        <StatusBar style="light" />
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <InitialLayout />
              <ToastProvider />
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
