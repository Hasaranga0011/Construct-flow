import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const handleResetPassword = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccessMsg('A password reset link has been sent to your email.');
    }
    setLoading(false);
  };

  return (
    <View className="flex-1 flex-row bg-white">
      {/* Left Column: Form */}
      <View className="w-full lg:w-1/2 flex-1 items-center justify-center p-8 md:p-12">
        <View className="w-full max-w-md">
          <View className="items-center mb-10">
            {/* ── Construct Ai Logo ── */}
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
            <View className="w-full">
              <Text className="text-4xl font-extrabold text-brand-text mb-2">Reset Password</Text>
              <Text className="text-gray-500 text-base leading-relaxed">Enter your email address and we&apos;ll send you a secure link to reset your password.</Text>
            </View>
          </View>

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

          <View className="mb-8">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Email Address</Text>
            <TextInput
              className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
              placeholder="name@company.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Pressable 
            onPress={handleResetPassword}
            disabled={loading || !!successMsg}
            className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md hover:bg-orange-600 transition-colors mb-8 ${loading || !!successMsg ? 'opacity-70' : ''}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Send Reset Link</Text>
            )}
          </Pressable>

          <View className="flex-row justify-center">
            <Text className="text-gray-500">Remember your password? </Text>
            <Link href="/login" asChild>
              <Pressable>
                <Text className="text-brand-orange font-bold hover:underline">Back to Login</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>

      {/* Right Column: Graphic/Hero */}
      <View className="hidden lg:flex w-1/2 bg-brand-dark relative overflow-hidden items-center justify-center">
        {/* Background Image with Overlay */}
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200' }} 
          className="absolute w-full h-full opacity-20"
          resizeMode="cover"
        />
        <View className="absolute inset-0 bg-brand-dark/90" />
        
        {/* Abstract Shapes */}
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 px-16 max-w-xl">
          <View className="w-16 h-16 bg-brand-orange/20 rounded-2xl items-center justify-center mb-8 border border-brand-orange/30">
            <Ionicons name="lock-closed" size={32} color="#F97316" />
          </View>
          <Text className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Secure Recovery</Text>
          <Text className="text-white font-extrabold text-5xl leading-tight mb-6">Regain access to your workspace.</Text>
          <Text className="text-gray-400 text-lg leading-relaxed mb-12">Your data is secured with enterprise-grade encryption. Once verified, you can quickly get back to managing your projects and team.</Text>
        </View>
      </View>
    </View>
  );
}
