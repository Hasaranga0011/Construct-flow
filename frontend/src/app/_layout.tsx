import '../global.css';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useEffect } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ToastProvider } from '../components/common/ToastProvider';

import { normalizeRole } from '../utils/auth';

const DASHBOARD_MAP: Record<string, string> = {
  admin: '/admin/dashboard',
  pm: '/pm/dashboard',
  site_manager: '/site-manager/dashboard',
  client: '/client/dashboard',
  worker: '/worker/dashboard',
  supplier: '/supplier/dashboard',
};

const AUTH_PAGES = ['login', 'register', 'forgot-password', 'reset-password'];
const ROLE_PORTALS = ['admin', 'pm', 'site-manager', 'client', 'worker', 'supplier', 'site'];

function InitialLayout() {
  const { session, role, isLoading, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  usePushNotifications(session?.user?.id || null);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (isLoading) return;

    const firstSegment = (segments as string[])[0] ?? '';
    const inAuthPage = AUTH_PAGES.includes(firstSegment);
    const inRolePortal = ROLE_PORTALS.includes(firstSegment);
    const inLanding = firstSegment === '';

    if (!session && inRolePortal) {
      router.replace('/login');
      return;
    }

    if (session && inAuthPage && firstSegment !== 'reset-password') {
      const dest = DASHBOARD_MAP[normalizeRole(role) ?? ''];
      if (dest) router.replace(dest as any);
      return;
    }

    if (session && inRolePortal && role) {
      const portalRole = firstSegment === 'site' ? 'site-manager' : firstSegment;
      const expectedPortal = normalizeRole(role) === 'site_manager' ? 'site-manager' : normalizeRole(role);
      if (expectedPortal && portalRole !== expectedPortal) {
        const dest = DASHBOARD_MAP[normalizeRole(role) ?? ''];
        if (dest) router.replace(dest as any);
        return;
      }
    }

    if (session && inLanding) {
      const dest = DASHBOARD_MAP[normalizeRole(role) ?? ''];
      if (dest) router.replace(dest as any);
      return;
    }

  }, [session, role, isLoading, segments, rootNavigationState, router]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-brand-dark items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  const firstSegment = (segments as string[])[0] ?? '';
  const inRolePortal = ROLE_PORTALS.includes(firstSegment);

  if (session && inRolePortal && !DASHBOARD_MAP[normalizeRole(role) ?? '']) {
    return <View className="flex-1 items-center justify-center p-6 bg-white">
      <Text className="text-lg text-gray-900 mb-4">Your account does not have an authorized role. Contact your administrator.</Text>
      <Pressable onPress={() => void signOut()} className="bg-brand-orange px-6 py-3 rounded-lg"><Text className="text-white">Sign out</Text></Pressable>
    </View>;
  }
  const expectedPortal = normalizeRole(role) === 'site_manager' ? 'site-manager' : normalizeRole(role);
  const actualPortal = firstSegment === 'site' ? 'site-manager' : firstSegment;
  if (inRolePortal && (!session || actualPortal !== expectedPortal)) {
    return (
      <View className="flex-1 bg-brand-dark items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View className="flex-1 bg-slate-950">
        <StatusBar style="light" />
        <ThemeProvider>
          <AuthProvider>
            <InitialLayout />
            <ToastProvider />
          </AuthProvider>
        </ThemeProvider>
      </View>
    </SafeAreaProvider>
  );
}
