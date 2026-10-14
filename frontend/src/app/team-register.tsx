import React, { useState, useCallback } from 'react';
import { Platform,  View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();
import { getApiUrl } from '../lib/apiUrl';
import AuthPageLayout from '../components/auth/AuthPageLayout';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { roleLabel } from '../utils/roles';
import { noAutofill } from '../lib/formAutofill';

export default function RegisterScreen() {
  // Registration never reads stored/remembered values; every field starts empty.
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const resetForm = useCallback(() => {
    setFullName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setShowPassword(false); setShowConfirmPassword(false); setRole('');
    setLoading(false); setErrorMsg('');
  }, []);

  // Reset on focus and on blur/unmount so returning (or after logout) shows an empty form.
  useFocusEffect(useCallback(() => { resetForm(); return resetForm; }, [resetForm]));

  const handleRegister = async () => {
    if (!role) {
      setErrorMsg('Please choose a role: Project Manager, Site Manager, or Worker.');
      return;
    }
    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    // Enforce valid Gmail address
    const trimmedEmail = email.trim().toLowerCase();
    const typoDomains = [
      'gnail.com', 'gamil.com', 'gmial.com', 'gmaill.com',
      'gmai.com', 'gmal.com', 'gmaik.com', 'gmeil.com',
      'gmail.co', 'gmail.con', 'gmail.cpm', 'gmail.cm',
      'gemail.com', 'gmail.com.com', 'gmaild.com'
    ];
    const emailParts = trimmedEmail.split('@');
    const domainPart = emailParts.length > 1 ? emailParts[1].trim() : '';

    if (typoDomains.includes(domainPart)) {
      setErrorMsg(`Did you mean @gmail.com? You entered '@${domainPart}'. Only valid Gmail accounts (@gmail.com) are permitted.`);
      return;
    }

    if (domainPart !== 'gmail.com') {
      setErrorMsg('Only valid Gmail accounts (@gmail.com) are permitted for registration. Please enter a valid @gmail.com address.');
      return;
    }

    const usernamePart = emailParts[0];
    const gmailUsernameRegex = /^[a-zA-Z0-9](?!.*\.\.)[a-zA-Z0-9.]{4,28}[a-zA-Z0-9]$/;
    if (!gmailUsernameRegex.test(usernamePart)) {
      setErrorMsg('Invalid Gmail address. Gmail usernames must be 6-30 characters long and contain only letters, numbers, and non-consecutive periods.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    let backendSucceeded = false;
    let backendErrorMessage: string | null = null;

    try {
      // Attempt registration through backend API to set app_metadata
      const res = await fetch(`${getApiUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          full_name: fullName.trim(),
          role,
          portal: 'internal',
        }),
      });

      if (res.ok) {
        backendSucceeded = true;
        resetForm();
        router.replace('/team-login');
        return;
      } else {
        const errJson = await res.json().catch(() => ({}));
        backendErrorMessage = errJson.detail || `Registration failed (${res.status})`;
      }
    } catch (networkErr: any) {
      console.warn('Backend API /auth/register unreachable, falling back to direct Supabase sign up:', networkErr);
    }

    // If backend returned a specific error (e.g. role violation, invalid phone, trigger error), display it
    if (backendErrorMessage) {
      setErrorMsg(backendErrorMessage);
      setLoading(false);
      return;
    }

    // Direct Supabase sign up fallback if backend service was unreachable
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: role,
          }
        }
      });

      if (error) {
        console.error('SUPABASE RAW ERROR:', error);
        let displayError = error.message;
        if (!displayError || displayError === '{}' || typeof displayError === 'object') {
          displayError = 'Registration failed. A database configuration issue occurred while creating your account.';
        }
        setErrorMsg(displayError);
        setLoading(false);
      } else {
        if (data.session) {
          await supabase.auth.signOut();
        }
        resetForm();
        router.replace('/team-login');
      }
    } catch (fallbackErr: any) {
      setErrorMsg(fallbackErr.message || 'An unexpected error occurred during registration.');
      setLoading(false);
    }
  };

    const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      // Save selected role to local storage so it survives the OAuth redirect
      if (typeof role !== 'undefined' && role) {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('pending_google_role', role);
      }

      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo, 
          skipBrowserRedirect: Platform.OS !== 'web' 
        },
      });
      
      if (error || !data?.url) throw error ?? new Error('No OAuth URL returned');

      if (Platform.OS !== 'web') {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) {
          const url = new URL(res.url);
          const hashStr = url.hash ? url.hash.replace('#', '?') : url.search;
          const params = new URLSearchParams(hashStr);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          } else {
             const code = params.get('code');
             if (code) {
               await supabase.auth.exchangeCodeForSession(code);
             }
          }
        } else if (res.type === 'cancel') {
          setErrorMsg('Google Sign-In was cancelled.');
        } else {
          setErrorMsg('Google Sign-In failed.');
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
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
            style={{ width: 80, height: 80, marginBottom: 16 }}
            resizeMode="contain"
          />
        </Pressable>
        <View className="w-full">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl md:text-4xl font-extrabold text-brand-text mb-2">Team Registration</Text>
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
          {...noAutofill('reg_team_full_name')}
        />
      </View>

      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700">Gmail Address</Text>
          <Text className="text-xs text-brand-orange font-medium">@gmail.com required</Text>
        </View>
        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
          className="w-full border border-gray-300 rounded-xl p-4 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
          placeholder="yourname@gmail.com"
          value={email}
          onChangeText={setEmail}
          {...noAutofill('reg_team_email', 'email')}
          keyboardType="email-address"
          autoCapitalize="none"
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
            {...noAutofill('reg_team_password', 'new-password')}
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
            {...noAutofill('reg_team_confirm_password', 'new-password')}
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
          {['worker', 'site_manager', 'pm'].map((r) => (
            <Pressable style={{ minHeight: 44, minWidth: 44 }}
              key={r}
              onPress={() => setRole(r)}
              className={`flex-1 p-3 rounded-xl border ${role === r ? 'border-brand-orange bg-orange-50' : 'border-gray-300 bg-gray-50'} items-center`}
            >
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-medium capitalize ${role === r ? 'text-brand-orange' : 'text-gray-500'}`}>
                {roleLabel(r)}
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
        <Link href="/team-login" asChild>
          <Pressable style={{ minHeight: 44, minWidth: 44 }}>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold hover:underline">Sign In</Text>
          </Pressable>
        </Link>
      </View>
    </AuthPageLayout>
  );
}
