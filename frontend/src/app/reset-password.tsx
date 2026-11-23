import AuthPageLayout from '../components/auth/AuthPageLayout';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen() {
  const { role } = useAuth();
  const [invalidLink, setInvalidLink] = useState(() => {
    if (typeof window === 'undefined' || !window.location) return false;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    return parameters.has('error') || parameters.has('error_code');
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(invalidLink ? 'This reset link has expired or has already been used. Request a new link below.' : '');
  const [successMsg, setSuccessMsg] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!invalidLink);
  const router = useRouter();
  const loginRoute = role === 'client' || role === 'supplier' ? '/partner-login' : role === 'admin' ? '/admin-login' : '/team-login';

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location) return;
    const checkLink = () => {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      const invalid = parameters.has('error') || parameters.has('error_code');
      setInvalidLink(invalid);
      if (invalid) {
        setSessionReady(false);
        setCheckingSession(false);
        setErrorMsg('This reset link has expired or has already been used. Request a new link below.');
      }
    };
    window.addEventListener('hashchange', checkLink);
    return () => window.removeEventListener('hashchange', checkLink);
  }, []);

  // Supabase sends the user back with an access_token in the URL hash.
  // We listen for the PASSWORD_RECOVERY event which fires automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !invalidLink) {
        setSessionReady(true);
        setCheckingSession(false);
      }
    });
    let mounted = true;
    // Recovery can complete before this screen mounts.
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSessionReady(!invalidLink && !!data.session); setCheckingSession(false); }
    }).catch(() => {
      if (mounted) { setSessionReady(false); setCheckingSession(false); setErrorMsg('Unable to verify this recovery session. Request a new link below.'); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [invalidLink]);

  const handleReset = async () => {
    if (!sessionReady) {
      setErrorMsg('Please open a valid password reset link from your email.');
      return;
    }
    if (!password || !confirmPassword) {
      setErrorMsg('Please fill in both fields.');
      return;
    }
    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setSuccessMsg('Password updated successfully! Redirecting to login…');
      setTimeout(() => router.replace(loginRoute), 2500);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Unable to update your password. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout hero={
      <View className="w-1/2 py-12 bg-brand-dark relative overflow-hidden items-center justify-center">
        <View className="absolute inset-0 bg-brand-dark/95" />
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 w-full px-8 xl:px-16 max-w-xl">
          <View className="w-16 h-16 bg-brand-orange/20 rounded-2xl items-center justify-center mb-8 border border-brand-orange/30">
            <Ionicons name="shield-checkmark" size={32} color="#F97316" />
          </View>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Account Recovery</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-5xl leading-tight mb-6">
            Secure your workspace.
          </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-lg leading-relaxed">
            Choose a strong, unique password. Your data is protected with enterprise-grade encryption and is never stored in plain text.
          </Text>
        </View>
      </View>
    }>

          {/* Logo */}
          <Pressable
            onPress={() => router.push('/')}
            style={[{ width: '100%', maxWidth: 280, marginBottom: 24 }, { minHeight: 44, minWidth: 44 }]}
          >
            <Image
              source={require('../../assets/images/main-logo.png')}
              style={{ width: 80, height: 80, marginBottom: 16 }}
              resizeMode="contain"
            />
          </Pressable>

          <View className="mb-10">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-4xl font-extrabold text-brand-text mb-2">Set New Password</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-base leading-relaxed">
              Choose a strong password for your account.
            </Text>
          </View>

          {/* Not arrived via email link */}
          {checkingSession && <View className="items-center p-5"><ActivityIndicator color="#F97316" /><Text className="text-slate-500 mt-3">Verifying your reset link...</Text></View>}
          {!checkingSession && !sessionReady && !successMsg && (
            <View className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-yellow-700 text-sm text-center">
                Please open this page from the reset link in your email.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={{ minHeight: 44 }} className="items-center justify-center mt-2">
                <Text className="text-brand-orange font-semibold">Request a new reset link</Text>
              </Pressable>
            </View>
          )}

          {errorMsg ? (
            <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-sm text-center">{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View className="bg-green-50 p-4 rounded-lg border border-green-200 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-green-700 text-sm text-center font-medium">{successMsg}</Text>
            </View>
          ) : null}

          {/* New Password */}
          {sessionReady && !successMsg && <>
          <View className="mb-5">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">New Password</Text>
            <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 p-4 text-brand-text outline-none"
                placeholder="At least 12 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={sessionReady && !successMsg}
              />
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowPassword(!showPassword)} className="p-2 cursor-pointer min-w-[44px] min-h-[44px] items-center justify-center" accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {/* Confirm Password */}
          <View className="mb-8">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Confirm Password</Text>
            <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 p-4 text-brand-text outline-none"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                editable={sessionReady && !successMsg}
              />
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowConfirm(!showConfirm)} className="p-2 cursor-pointer min-w-[44px] min-h-[44px] items-center justify-center" accessibilityLabel={showConfirm ? "Hide password" : "Show password"}>
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {/* Submit */}
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={handleReset}
            disabled={loading || !sessionReady || !!successMsg}
            className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md mb-8 ${loading || !sessionReady || !!successMsg ? 'opacity-60' : 'hover:bg-orange-600'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Update Password</Text>
            )}
          </Pressable>

          </>}
          <View className="flex-row flex-wrap justify-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Back to </Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(loginRoute)}>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold hover:underline">Login</Text>
            </Pressable>
          </View>

    </AuthPageLayout>
  );
}
