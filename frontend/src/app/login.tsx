import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Please fill in all fields');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      router.replace('/');
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    } catch (error: any) {
      setErrorMsg(error.message);
    }
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
              <Text className="text-4xl font-extrabold text-brand-text mb-2">Welcome Back</Text>
              <Text className="text-gray-500 text-base">Enter your email and password to access your account.</Text>
            </View>
          </View>

          {errorMsg ? (
            <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
              <Text className="text-red-600 text-sm text-center">{errorMsg}</Text>
            </View>
          ) : null}

          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Email</Text>
            <TextInput
              className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
              placeholder="name@company.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-2 z-10">
              <Text className="text-sm font-semibold text-gray-700">Password</Text>
              <Link href="/forgot-password" style={{ zIndex: 10 }}>
                <Text className="text-sm font-medium text-brand-orange hover:underline">Forgot password?</Text>
              </Link>
            </View>
            <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
              <TextInput
                className="flex-1 p-4 text-brand-text outline-none"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} className="p-2 cursor-pointer">
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>
          
          <View className="flex-row items-center mb-8">
            <View className="w-5 h-5 border border-gray-300 rounded mr-3 items-center justify-center bg-gray-50" />
            <Text className="text-gray-600 text-sm">Remember me</Text>
          </View>

          <Pressable 
            onPress={handleLogin}
            disabled={loading}
            className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Log In</Text>
            )}
          </Pressable>
          
          <View className="flex-row items-center justify-center my-8">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="px-4 text-gray-400 font-medium text-sm">Or Login With</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          <View className="flex-row mb-8">
            <Pressable onPress={handleGoogleAuth} className="w-full flex-row items-center justify-center py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
              <Image 
                source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png' }} 
                style={{ width: 20, height: 20, marginRight: 10 }} 
                resizeMode="contain"
              />
              <Text className="text-brand-text font-semibold text-base">Continue with Google</Text>
            </Pressable>
          </View>

          <View className="flex-row justify-center">
            <Text className="text-gray-500">Don't have an account? </Text>
            <Link href="/register" asChild>
              <Pressable>
                <Text className="text-brand-orange font-bold hover:underline">Register Now</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>

      {/* Right Column: Graphic/Hero */}
      <View className="hidden lg:flex w-1/2 bg-brand-dark relative overflow-hidden items-center justify-center">
        {/* Background Image with Overlay */}
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=1200' }} 
          className="absolute w-full h-full opacity-20"
          resizeMode="cover"
        />
        <View className="absolute inset-0 bg-brand-dark/90" />
        
        {/* Abstract Shapes */}
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 px-16 max-w-xl">
          <Text className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Construction Management Platform</Text>
          <Text className="text-white font-extrabold text-5xl leading-tight mb-6">Effortlessly manage your team and operations.</Text>
          <Text className="text-gray-400 text-lg leading-relaxed mb-12">Log in to access your CRM, manage your team, track materials, and oversee active projects across all your sites in real-time.</Text>
          
          {/* Decorative Mockup */}
          <View className="bg-white/10 p-6 rounded-3xl border border-white/20 backdrop-blur-md shadow-2xl">
            <View className="flex-row items-center border-b border-white/10 pb-4 mb-4">
               <View className="w-3 h-3 rounded-full bg-red-400 mr-2" />
               <View className="w-3 h-3 rounded-full bg-yellow-400 mr-2" />
               <View className="w-3 h-3 rounded-full bg-green-400" />
            </View>
            <View className="flex-row mb-4">
              <View className="flex-1 bg-white/20 h-24 rounded-xl p-4 justify-end mr-4">
                 <View className="w-8 h-2 bg-white/40 rounded-full mb-2" />
                 <View className="w-20 h-4 bg-brand-orange rounded-full" />
              </View>
              <View className="flex-1 bg-white/20 h-24 rounded-xl p-4 justify-end">
                 <View className="w-12 h-2 bg-white/40 rounded-full mb-2" />
                 <View className="w-16 h-4 bg-white rounded-full" />
              </View>
            </View>
            <View className="w-full bg-white/20 h-32 rounded-xl" />
          </View>
        </View>
      </View>
    </View>
  );
}
