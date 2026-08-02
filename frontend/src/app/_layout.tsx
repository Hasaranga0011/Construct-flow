import '../global.css';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Toaster } from 'react-hot-toast';

function InitialLayout() {
  const { session, role, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  
  usePushNotifications(session?.user?.id || null);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = (segments as string[]).length === 0 || segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password';

    if (!session && !inAuthGroup) {
      // Redirect to the login page if not authenticated
      router.replace('/login');
    } else if (session && inAuthGroup) {
      if (role === 'Super Admin') {
        router.replace('/admin' as any);
      } else if (role === 'Project Manager') {
        router.replace('/pm' as any);
      } else if (role === 'Site Manager') {
        router.replace('/site' as any);
      } else if (role === 'Client') {
        router.replace('/client' as any);
      } else if (role === 'Worker') {
        router.replace('/worker' as any);
      } else if (role === 'Supplier') {
        router.replace('/supplier' as any);
      } else {
        router.replace('/login' as any); // Fallback if role is unknown
      }
    }
  }, [session, role, isLoading, segments]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-brand-dark items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  const inAuthGroup = (segments as string[]).length === 0 || segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password';

  if (!session && !inAuthGroup) {
    // Avoid rendering the protected slots while the redirect is in flight
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
    <ThemeProvider>
      <AuthProvider>
        <InitialLayout />
        {/* Global toast notifications for web */}
        <Toaster position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
