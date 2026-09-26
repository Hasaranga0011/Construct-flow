import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  // Supabase sends the user back with an access_token in the URL hash.
  // We listen for the PASSWORD_RECOVERY event which fires automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    let mounted = true;
    // Recovery can complete before this screen mounts.
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSessionReady(!!data.session);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleReset = async () => {
    if (!sessionReady) {
      setErrorMsg('Please open a valid password reset link from your email.');
      return;
    }
    if (!password || !confirmPassword) {
      setErrorMsg('Please fill in both fields.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
    } else {
      await supabase.auth.signOut();
      setSuccessMsg('Password updated successfully! Redirecting to login…');
      setTimeout(() => router.replace('/login'), 2500);
    }
    setLoading(false);
  };

  return (
    <View className="flex-1 flex-row bg-white">
      {/* Left Column: Form */}
      <View className="w-full lg:w-1/2 flex-1 items-center justify-center p-8 md:p-12">
        <View className="w-full max-w-md">

          {/* Logo */}
          <Pressable
            onPress={() => router.push('/home')}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 28, gap: 10 }}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: '#F97316',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
            }}>
              <MaterialIcons name="precision-manufacturing" size={22} color="#fff" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1a1a2e', letterSpacing: 0.3 }}>
              Construct<Text style={{ color: '#F97316' }}>Ai</Text>
            </Text>
          </Pressable>

          <View className="mb-10">
            <Text className="text-4xl font-extrabold text-brand-text mb-2">Set New Password</Text>
            <Text className="text-gray-500 text-base leading-relaxed">
              Choose a strong password for your account.
            </Text>
          </View>

          {/* Not arrived via email link */}
          {!sessionReady && !successMsg && (
            <View className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-6">
              <Text className="text-yellow-700 text-sm text-center">
                Please open this page from the reset link in your email.
              </Text>
            </View>
          )}

          {errorMsg ? (
            <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
              <Text className="text-red-600 text-sm text-center">{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View className="bg-green-50 p-4 rounded-lg border border-green-200 mb-6">
              <Text className="text-green-700 text-sm text-center font-medium">{successMsg}</Text>
            </View>
          ) : null}

          {/* New Password */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">New Password</Text>
            <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
              <TextInput
                className="flex-1 p-4 text-brand-text outline-none"
                placeholder="At least 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={sessionReady && !successMsg}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} className="p-2">
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {/* Confirm Password */}
          <View className="mb-8">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Confirm Password</Text>
            <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
              <TextInput
                className="flex-1 p-4 text-brand-text outline-none"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                editable={sessionReady && !successMsg}
              />
              <Pressable onPress={() => setShowConfirm(!showConfirm)} className="p-2">
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleReset}
            disabled={loading || !sessionReady || !!successMsg}
            className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md mb-8 ${loading || !sessionReady || !!successMsg ? 'opacity-60' : 'hover:bg-orange-600'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Update Password</Text>
            )}
          </Pressable>

          <View className="flex-row justify-center">
            <Text className="text-gray-500">Back to </Text>
            <Pressable onPress={() => router.push('/login')}>
              <Text className="text-brand-orange font-bold hover:underline">Login</Text>
            </Pressable>
          </View>

        </View>
      </View>

      {/* Right Column: Hero */}
      <View className="hidden lg:flex w-1/2 bg-brand-dark relative overflow-hidden items-center justify-center">
        <View className="absolute inset-0 bg-brand-dark/95" />
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 px-16 max-w-xl">
          <View className="w-16 h-16 bg-brand-orange/20 rounded-2xl items-center justify-center mb-8 border border-brand-orange/30">
            <Ionicons name="shield-checkmark" size={32} color="#F97316" />
          </View>
          <Text className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Account Recovery</Text>
          <Text className="text-white font-extrabold text-5xl leading-tight mb-6">
            Secure your workspace.
          </Text>
          <Text className="text-gray-400 text-lg leading-relaxed">
            Choose a strong, unique password. Your data is protected with enterprise-grade encryption and is never stored in plain text.
          </Text>
        </View>
      </View>
    </View>
  );
}
