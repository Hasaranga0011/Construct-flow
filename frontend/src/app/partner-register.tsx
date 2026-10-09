import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import AuthPageLayout from '../components/auth/AuthPageLayout';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('client');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        }
      }
    });

    if (error) {
      console.error('SUPABASE RAW ERROR:', error);
      let displayError = error.message;
      if (typeof displayError === 'object' || displayError === '{}' || !displayError) {
        displayError = JSON.stringify(error);
      }
      setErrorMsg(displayError);
      setLoading(false);
    } else {
      // Sign out immediately to prevent auto-login
      if (data.session) {
        await supabase.auth.signOut();
      }
      // Force them to the login screen
      router.replace('/partner-login');
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
    <AuthPageLayout hero={
      <View className="bg-brand-dark relative overflow-hidden items-center justify-center"
        style={{ width: '50%', flexShrink: 0, paddingVertical: 48 }}>
        {/* Background Image with Overlay */}
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=1200' }}
          className="absolute w-full h-full opacity-20"
          resizeMode="cover"
        />
        <View className="absolute inset-0 bg-brand-dark/90" />

        {/* Abstract Shapes */}
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 w-full px-8 xl:px-16 max-w-xl">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Start Building Today</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-5xl leading-tight mb-6">Gain complete control over your projects.</Text>

          <View className="mb-6 flex-row items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <View className="w-12 h-12 bg-orange-500/20 rounded-full items-center justify-center mr-4">
               <FontAwesome5 name="chart-line" size={20} color="#F97316" />
            </View>
            <View className="flex-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Real-Time Tracking</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">Monitor costs, labor, and materials.</Text>
            </View>
          </View>

          <View className="mb-6 flex-row items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <View className="w-12 h-12 bg-blue-500/20 rounded-full items-center justify-center mr-4">
               <FontAwesome5 name="users-cog" size={20} color="#3B82F6" />
            </View>
            <View className="flex-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Role-Based Access</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">Separate views for admins, managers & clients.</Text>
            </View>
          </View>

          <View className="flex-row items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <View className="w-12 h-12 bg-green-500/20 rounded-full items-center justify-center mr-4">
               <FontAwesome5 name="robot" size={20} color="#10B981" />
            </View>
            <View className="flex-1">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">AI Estimations</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm">Generate quick, accurate quotes using AI.</Text>
            </View>
          </View>

        </View>
      </View>
    }>
      <View className="items-center mb-8">
        {/* ── Construct Ai Logo ── */}
        <Pressable
          onPress={() => router.push('/')}
          style={[{ alignSelf: 'flex-start', width: '100%', maxWidth: 280, marginBottom: 24 }, { minHeight: 44, minWidth: 44 }]}
          accessibilityLabel="ConstructAi home"
        >
          <Image
            source={require('../../assets/images/main-logo.png')}
            style={{ width: '100%', aspectRatio: 4 }}
            resizeMode="contain"
          />
        </Pressable>
        <View className="w-full">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl md:text-4xl font-extrabold text-brand-text mb-2">Partner Registration</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-base">Join ConstructAi today to manage your team.</Text>
        </View>
      </View>

      {errorMsg ? (
        <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-6">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 text-sm text-center">{errorMsg}</Text>
        </View>
      ) : null}

      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Full Name</Text>
        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
          className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
          placeholder="John Doe"
          value={fullName}
          onChangeText={setFullName}
        />
      </View>

      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Email</Text>
        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
          className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
          placeholder="name@company.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Password</Text>
        <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="flex-1 p-4 text-brand-text outline-none"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="next"
          />
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowPassword(!showPassword)} className="p-2 cursor-pointer min-w-[44px] min-h-[44px] items-center justify-center" accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>

      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Confirm Password</Text>
        <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
          <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
            className="flex-1 p-4 text-brand-text outline-none"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setShowConfirmPassword(!showConfirmPassword)} className="p-2 cursor-pointer min-w-[44px] min-h-[44px] items-center justify-center" accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}>
            <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>


      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">Role</Text>
        <View className="flex-row gap-2">
          {['client', 'supplier'].map((r) => (
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              key={r}
              onPress={() => setRole(r)}
              className={`flex-1 p-3 rounded-xl border ${role === r ? 'border-brand-orange bg-orange-50' : 'border-gray-300 bg-gray-50'} items-center`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-medium capitalize ${role === r ? 'text-brand-orange' : 'text-gray-500'}`}>
                {r.replace('_', ' ')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>


      <Pressable style={{ minHeight: 44, minWidth: 44 }}
        onPress={handleRegister}
        disabled={loading}
        className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Sign Up</Text>
        )}
      </Pressable>

      <View className="flex-row items-center justify-center my-6">
        <View className="flex-1 h-px bg-gray-200" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="px-4 text-gray-400 font-medium text-sm">Or Sign Up With</Text>
        <View className="flex-1 h-px bg-gray-200" />
      </View>

      <View className="flex-row mb-6">
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={handleGoogleAuth} className="w-full flex-row items-center justify-center py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
          <Image
            source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png' }}
            style={{ width: 20, height: 20, marginRight: 10 }}
            resizeMode="contain"
          />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-base">Continue with Google</Text>
        </Pressable>
      </View>

      <View className="flex-row flex-wrap justify-center pb-8">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Already have an account? </Text>
        <Link href="/partner-login" asChild>
          <Pressable style={{ minHeight: 44, minWidth: 44 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold hover:underline">Sign In</Text>
          </Pressable>
        </Link>
      </View>
    </AuthPageLayout>
  );
}
