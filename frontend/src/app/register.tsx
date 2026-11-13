import React, { useState, useCallback, useEffect } from 'react';
import { Platform, View, Text, TextInput, Pressable, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();
import { getApiUrl } from '../lib/apiUrl';
import AuthPageLayout from '../components/auth/AuthPageLayout';
import Ionicons from '@expo/vector-icons/Ionicons';
import { noAutofill } from '../lib/formAutofill';
import { normalizeRole } from '../utils/auth';

type RoleCategory = 'all' | 'team' | 'partner';

interface RoleOption {
  id: string;
  category: 'team' | 'partner';
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  portal: 'internal' | 'partner';
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'pm',
    category: 'team',
    title: 'Project Manager',
    subtitle: 'Budgets, timelines, material approvals & team leadership',
    icon: 'business-outline',
    portal: 'internal',
  },
  {
    id: 'site_manager',
    category: 'team',
    title: 'Site Manager',
    subtitle: 'Daily site operations, worker logs & QR attendance',
    icon: 'construct-outline',
    portal: 'internal',
  },
  {
    id: 'worker',
    category: 'team',
    title: 'Field Worker',
    subtitle: 'Daily attendance badge, hours & salary slip records',
    icon: 'hammer-outline',
    portal: 'internal',
  },
  {
    id: 'client',
    category: 'partner',
    title: 'Client / Owner',
    subtitle: 'Live project progress, milestones, media & invoices',
    icon: 'home-outline',
    portal: 'partner',
  },
  {
    id: 'supplier',
    category: 'partner',
    title: 'Material Supplier',
    subtitle: 'Purchase orders, delivery status & material catalog',
    icon: 'cube-outline',
    portal: 'partner',
  },
];

export default function UnifiedRegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ portal?: string; role?: string }>();

  const [activeTab, setActiveTab] = useState<RoleCategory>('all');
  const [role, setRole] = useState<string>('pm');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Handle portal or role passed via URL query params
  useEffect(() => {
    if (params.portal === 'team' || params.portal === 'internal') {
      setActiveTab('team');
      if (!role || role === 'client' || role === 'supplier') setRole('pm');
    } else if (params.portal === 'partner' || params.portal === 'external') {
      setActiveTab('partner');
      if (!role || role === 'pm' || role === 'site_manager' || role === 'worker') setRole('client');
    }

    if (params.role) {
      const normalized = normalizeRole(params.role);
      if (normalized && ROLE_OPTIONS.some(r => r.id === normalized)) {
        setRole(normalized);
        const match = ROLE_OPTIONS.find(r => r.id === normalized);
        if (match) setActiveTab(match.category);
      }
    }
  }, [params.portal, params.role]);

  const resetForm = useCallback(() => {
    setFullName('');
    setEmail('');
    setContactNumber('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setLoading(false);
    setErrorMsg('');
  }, []);

  useFocusEffect(useCallback(() => {
    resetForm();
    return resetForm;
  }, [resetForm]));

  const filteredRoles = activeTab === 'all'
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(r => r.category === activeTab);

  const selectedRoleMeta = ROLE_OPTIONS.find(r => r.id === role) || ROLE_OPTIONS[0];

  const handleRegister = async () => {
    if (!role) {
      setErrorMsg('Please select your role to proceed.');
      return;
    }
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMsg('Please fill in all required fields.');
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

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const portalType = selectedRoleMeta.portal;
    let backendErrorMessage: string | null = null;

    try {
      // 1. Attempt registration through backend API
      const res = await fetch(`${getApiUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          full_name: fullName.trim(),
          role,
          portal: portalType,
          contact_number: contactNumber.trim() || undefined,
        }),
      });

      if (res.ok) {
        resetForm();
        const targetLogin = portalType === 'partner' ? '/partner-login?registered=1' : '/team-login?registered=1';
        router.replace(targetLogin as any);
        return;
      } else {
        const errJson = await res.json().catch(() => ({}));
        backendErrorMessage = errJson.detail || `Registration failed (${res.status})`;
      }
    } catch (networkErr: any) {
      console.warn('Backend API /auth/register unreachable, falling back to direct Supabase sign up:', networkErr);
    }

    if (backendErrorMessage) {
      setErrorMsg(backendErrorMessage);
      setLoading(false);
      return;
    }

    // 2. Direct Supabase sign up fallback if backend service was unreachable
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: role,
            contact_number: contactNumber.trim() || undefined,
          }
        }
      });

      if (error) {
        console.error('Supabase SignUp Error:', error);
        setErrorMsg(error.message || 'Registration failed. Please try again.');
        setLoading(false);
      } else {
        if (data.session) {
          await supabase.auth.signOut();
        }
        resetForm();
        const targetLogin = portalType === 'partner' ? '/partner-login?registered=1' : '/team-login?registered=1';
        router.replace(targetLogin as any);
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

      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('pending_google_role', role);

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
          const urlParams = new URLSearchParams(hashStr);
          const accessToken = urlParams.get('access_token');
          const refreshToken = urlParams.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          } else {
            const code = urlParams.get('code');
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
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=1200' }}
          className="absolute w-full h-full opacity-20"
          resizeMode="cover"
        />
        <View className="absolute inset-0 bg-brand-dark/90" />
        <View className="absolute -top-32 -right-32 w-96 h-96 bg-brand-orange/20 rounded-full blur-3xl" />
        <View className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

        <View className="z-10 w-full px-8 xl:px-16 max-w-xl">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold tracking-widest text-sm uppercase mb-4">Unified Registration</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-4xl lg:text-5xl leading-tight mb-6">One Platform for Construction Teams & Partners.</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-base lg:text-lg leading-relaxed mb-8">
            Select your role to get access to tailored workflows, real-time material logistics, automated attendance, and LKR cost forecasting.
          </Text>

          <View className="bg-white/10 p-5 rounded-3xl border border-white/20 backdrop-blur-md shadow-2xl space-y-3">
            <View className="flex-row items-center border-b border-white/10 pb-3">
              <View className="w-3 h-3 rounded-full bg-red-400 mr-2" />
              <View className="w-3 h-3 rounded-full bg-yellow-400 mr-2" />
              <View className="w-3 h-3 rounded-full bg-green-400 mr-3" />
              <Text className="text-gray-300 text-xs font-semibold uppercase tracking-wider">Role-Based Portals</Text>
            </View>
            <View className="flex-row justify-between pt-1">
              <View className="bg-white/10 rounded-xl p-3 flex-1 mr-2">
                <Text className="text-white font-bold text-xs mb-1">Team Portal</Text>
                <Text className="text-gray-400 text-[11px]">PMs, Site Managers, and Workers</Text>
              </View>
              <View className="bg-white/10 rounded-xl p-3 flex-1">
                <Text className="text-brand-orange font-bold text-xs mb-1">Partner Portal</Text>
                <Text className="text-gray-400 text-[11px]">Clients and Material Suppliers</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    }>
      {/* ── Brand Logo ── */}
      <View className="items-start mb-6">
        <Pressable
          onPress={() => router.push('/')}
          style={{ minHeight: 44, minWidth: 44 }}
          accessibilityLabel="ConstructAi home"
        >
          <Image
            source={require('../../assets/images/main-logo.png')}
            style={{ width: 64, height: 64, marginBottom: 12 }}
            resizeMode="contain"
          />
        </Pressable>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-extrabold text-brand-text mb-1">Create Account</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">Select your role to personalize your workspace experience.</Text>
      </View>

      {errorMsg ? (
        <View className="bg-red-50 p-3.5 rounded-xl border border-red-200 mb-6 flex-row items-center">
          <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-sm flex-1">{errorMsg}</Text>
        </View>
      ) : null}

      {/* ── Role Category Filter Tabs ── */}
      <View className="mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">1. Select Your Role</Text>
        <View className="flex-row p-1 rounded-xl bg-gray-100 border border-gray-200 mb-3">
          {[
            { id: 'all' as RoleCategory, label: 'All Roles' },
            { id: 'team' as RoleCategory, label: 'Team Roles' },
            { id: 'partner' as RoleCategory, label: 'Partner Roles' },
          ].map(tab => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 items-center justify-center rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white shadow-sm' : ''}`}
              style={{ minHeight: 38 }}
            >
              <Text className={`text-xs font-bold ${activeTab === tab.id ? 'text-brand-orange' : 'text-gray-600'}`}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Interactive Role Selection Cards ── */}
        <View className="space-y-2 mb-2">
          {filteredRoles.map(item => {
            const isSelected = role === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setRole(item.id)}
                className={`flex-row items-center p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? 'border-brand-orange bg-orange-50/60 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                style={{ minHeight: 56 }}
              >
                <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                  isSelected ? 'bg-brand-orange text-white' : 'bg-gray-100'
                }`}>
                  <Ionicons name={item.icon} size={20} color={isSelected ? '#ffffff' : '#64748B'} />
                </View>

                <View className="flex-1 min-w-0 pr-2">
                  <View className="flex-row items-center">
                    <Text className={`font-bold text-sm ${isSelected ? 'text-brand-orange' : 'text-gray-900'}`}>{item.title}</Text>
                    <View className={`ml-2 px-2 py-0.5 rounded-full ${item.category === 'team' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      <Text className={`text-[10px] font-semibold uppercase ${item.category === 'team' ? 'text-blue-700' : 'text-amber-700'}`}>
                        {item.category === 'team' ? 'Team' : 'Partner'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{item.subtitle}</Text>
                </View>

                <View className={`w-5 h-5 rounded-full border items-center justify-center ${
                  isSelected ? 'border-brand-orange bg-brand-orange' : 'border-gray-300 bg-white'
                }`}>
                  {isSelected && <Ionicons name="checkmark" size={13} color="#ffffff" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Personal & Credentials Form ── */}
      <View className="mt-2 mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm font-semibold text-gray-700 mb-2">2. Account Details</Text>

        {/* Full Name */}
        <View className="mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1.5">Full Name *</Text>
          <TextInput
            maxFontSizeMultiplier={1.3}
            style={{ minHeight: 44, minWidth: 44 }}
            className="w-full border border-gray-300 rounded-xl p-3.5 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
            placeholder="e.g. Kasun Perera"
            value={fullName}
            onChangeText={setFullName}
            {...noAutofill('reg_unified_name')}
          />
        </View>

        {/* Gmail Address */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700">Gmail Address *</Text>
            <Text className="text-[11px] text-brand-orange font-medium">@gmail.com required</Text>
          </View>
          <TextInput
            maxFontSizeMultiplier={1.3}
            style={{ minHeight: 44, minWidth: 44 }}
            className="w-full border border-gray-300 rounded-xl p-3.5 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
            placeholder="yourname@gmail.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            {...noAutofill('reg_unified_email', 'email')}
          />
        </View>

        {/* Contact Phone (Optional) */}
        <View className="mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1.5">Contact Number (Optional)</Text>
          <TextInput
            maxFontSizeMultiplier={1.3}
            style={{ minHeight: 44, minWidth: 44 }}
            className="w-full border border-gray-300 rounded-xl p-3.5 text-brand-text bg-gray-50 focus:border-brand-orange focus:bg-white transition-colors"
            placeholder="07X XXXXXXX or +947X XXXXXXX"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            {...noAutofill('reg_unified_phone', 'text')}
          />
        </View>

        {/* Password */}
        <View className="mb-4">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1.5">Password *</Text>
          <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
            <TextInput
              maxFontSizeMultiplier={1.3}
              style={{ minHeight: 44, minWidth: 44 }}
              className="flex-1 p-3.5 text-brand-text outline-none"
              placeholder="Minimum 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="next"
              {...noAutofill('reg_unified_password', 'new-password')}
            />
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => setShowPassword(!showPassword)}
              className="p-2 items-center justify-center"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
            </Pressable>
          </View>
        </View>

        {/* Confirm Password */}
        <View className="mb-6">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-700 mb-1.5">Confirm Password *</Text>
          <View className="w-full flex-row items-center border border-gray-300 rounded-xl bg-gray-50 pr-2">
            <TextInput
              maxFontSizeMultiplier={1.3}
              style={{ minHeight: 44, minWidth: 44 }}
              className="flex-1 p-3.5 text-brand-text outline-none"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              {...noAutofill('reg_unified_confirm', 'new-password')}
            />
            <Pressable
              style={{ minHeight: 44, minWidth: 44 }}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              className="p-2 items-center justify-center"
              accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Submit Button */}
      <Pressable
        style={{ minHeight: 48, minWidth: 44 }}
        onPress={handleRegister}
        disabled={loading}
        className={`w-full bg-brand-orange py-4 rounded-xl items-center justify-center shadow-md hover:bg-orange-600 transition-colors ${loading ? 'opacity-70' : ''}`}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">
            Register as {selectedRoleMeta.title}
          </Text>
        )}
      </Pressable>

      {/* Divider */}
      <View className="flex-row items-center justify-center my-6">
        <View className="flex-1 h-px bg-gray-200" />
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="px-4 text-gray-400 font-medium text-xs">Or Register With</Text>
        <View className="flex-1 h-px bg-gray-200" />
      </View>

      {/* Google OAuth Button */}
      <View className="flex-row mb-6">
        <Pressable
          style={{ minHeight: 44, minWidth: 44 }}
          onPress={handleGoogleAuth}
          className="w-full flex-row items-center justify-center py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Image
            source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png' }}
            style={{ width: 18, height: 18, marginRight: 10 }}
            resizeMode="contain"
          />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-semibold text-sm">
            Continue with Google ({selectedRoleMeta.title})
          </Text>
        </Pressable>
      </View>
    </AuthPageLayout>
  );
}
