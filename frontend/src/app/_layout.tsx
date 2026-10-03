import '../global.css';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useEffect } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ToastProvider } from '../components/common/ToastProvider';

import { normalizeRole } from '../utils/auth';
import { supabase } from '../lib/supabase';


const DASHBOARD_MAP: Record<string, string> = {
  admin: '/admin/dashboard',
  pm: '/pm/dashboard',
  site_manager: '/site-manager/dashboard',
  client: '/client/dashboard',
  worker: '/worker/dashboard',
  supplier: '/supplier/dashboard',
};

const AUTH_PAGES = ['team-login', 'team-register', 'partner-login', 'partner-register', 'admin-login', 'forgot-password', 'reset-password'];
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
          const metaRole = session.user.user_metadata?.role;
          const profileRole = profile?.role;
          const resolvedRole = metaRole ?? profileRole ?? null;
          routeWithRole(resolvedRole);
        });
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }}>
        <StatusBar style="light" />
        <ThemeProvider>
          <AuthProvider>
            <InitialLayout />
            <ToastProvider />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
