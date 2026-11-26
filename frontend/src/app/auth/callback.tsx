import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';

const destinations: Record<string, string> = {
  admin: '/admin/dashboard', pm: '/pm/dashboard', site_manager: '/site-manager/dashboard',
  worker: '/worker/dashboard', client: '/client/dashboard', supplier: '/supplier/dashboard',
};

export default function AuthCallback() {
  const { session, role, isLoading, isApproved, portalError } = useAuth();
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : incomingUrl;
        const parsed = url ? new URL(url) : null;
        const hash = new URLSearchParams(parsed?.hash.slice(1));
        if (parsed?.searchParams.has('error') || hash.has('error')) throw new Error('Sign-in was cancelled or the link has expired. Please sign in again.');
        // Web initializes from the callback URL; native login screens own the
        // browser-session result. Never exchange the same one-use code twice.
        let result = await supabase.auth.getSession();
        if (Platform.OS !== 'web') {
          for (let attempt = 0; active && !result.data.session && attempt < 20; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 250));
            result = await supabase.auth.getSession();
          }
        }
        if (result.error || !result.data.session) throw new Error('Unable to finish sign-in. Please return to login and try again.');
        if (active) setChecked(true);
      } catch {
        if (active) { setError('Unable to finish sign-in. The link may have expired or sign-in was cancelled. Please try again.'); setChecked(true); }
      }
    })();
    return () => { active = false; };
  }, [incomingUrl]);

  useEffect(() => {
    if (!checked || error || isLoading || !session) return;
    if (!isApproved) { router.replace('/pending-approval'); return; }
    const destination = role ? destinations[role] : null;
    if (destination) router.replace(destination as any);
    else setError('Your account does not have an assigned role. Contact your administrator.');
  }, [checked, error, isLoading, session, role, isApproved, router]);

  return <View className="flex-1 bg-brand-light items-center justify-center p-6">
    <View className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6" style={{ gap: 16 }}>
      <Text className="text-xl font-bold text-brand-text">{error || portalError ? 'Sign-in could not be completed' : 'Completing sign-in'}</Text>
      {error || portalError ? <><Text className="text-sm text-slate-600 leading-5">{portalError || error}</Text><Button label="Back to login" onPress={() => router.replace('/team-login')} /></> : <><ActivityIndicator color="#F97316" /><Text className="text-sm text-slate-500">Checking your account and opening your workspace…</Text></>}
    </View>
  </View>;
}
