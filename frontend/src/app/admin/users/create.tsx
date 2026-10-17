import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { ModalViewport } from '@/components/common/ModalViewport';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import Ionicons from '@expo/vector-icons/Ionicons';
import { notify } from '@/utils/notify';
import { noAutofill } from '@/lib/formAutofill';
import { PhoneInput } from '@/components/common/PhoneInput';
import { AmountInput } from '@/components/common/AmountInput';

const ROLES = [
  { label: 'Admin', value: 'super_admin' },
  { label: 'Project Manager', value: 'pm' },
  { label: 'Site Manager', value: 'site_manager' },
  { label: 'Client', value: 'client' },
  { label: 'Worker', value: 'worker' },
  { label: 'Supplier', value: 'supplier' },
];

const WORKER_TYPES = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'General Laborer'];

export default function AdminUsersCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [workerType, setWorkerType] = useState('General Laborer');
  const [dailyRate, setDailyRate] = useState<number | null>(null);

  const [createdUser, setCreatedUser] = useState<{
    fullName: string;
    email: string;
    role: string;
    temporaryPassword?: string | null;
    inviteLink?: string | null;
    rateLimited?: boolean;
    emailSent?: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedField(fieldName);
      notify('Success', `${fieldName} copied to clipboard!`);
      setTimeout(() => setCopiedField(null), 3000);
    } catch {
      notify('Info', text);
    }
  };

  const handleCopyAll = async () => {
    if (!createdUser) return;
    const lines = [
      `Welcome to ConstructFlow!`,
      `Here are your account access details:`,
      `• Login Email: ${createdUser.email}`,
      `• Temporary Password: ${createdUser.temporaryPassword || 'Use the activation link below'}`,
      `• Role: ${ROLES.find(r => r.value === createdUser.role)?.label || createdUser.role}`,
    ];
    if (createdUser.inviteLink) {
      lines.push(`• Direct Activation / Invite Link:\n${createdUser.inviteLink}`);
    } else {
      lines.push(`• Portal Login: ${getApiUrl().replace(':8000', ':8082')}`);
    }
    await handleCopy(lines.join('\n\n'), 'Account details');
  };

  const resetForm = useCallback(() => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSelectedRole('');
    setContactNumber('');
    setIsPhoneValid(true);
    setWorkerType('General Laborer');
    setDailyRate(null);
    setCreatedUser(null);
    setCopiedField(null);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    resetForm();
    return resetForm;
  }, [resetForm]));

  const handleCreate = async () => {
    if (!fullName || !email || !password || !selectedRole) {
      notify('Error', 'Name, email, password, and role are required.');
      return;
    }
    if (password.length < 6) {
      notify('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      notify('Error', 'Passwords do not match.');
      return;
    }
    if (contactNumber && !isPhoneValid) {
      notify('Error', 'Please enter a valid Sri Lankan phone number (e.g. 077 123 4567).');
      return;
    }

    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const payload = {
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        role: selectedRole,
        contact_number: contactNumber || null,
        send_email: true,
        worker_type: selectedRole === 'worker' ? workerType : null,
        daily_rate: selectedRole === 'worker' ? dailyRate : null
      };

      const apiUrl = getApiUrl();
      console.log('Sending request to:', `${apiUrl}/admin/users`);
      console.log('Payload:', payload);

      const response = await fetch(`${apiUrl}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch (e) {
          const text = await response.text();
          console.error('Failed to parse error JSON, text was:', text);
        }
        console.error('API Error Response:', errorData);
        throw new Error((errorData as any).detail || `Server returned ${response.status}`);
      }

      const data = await response.json();
      const emailSent = Boolean(data?.email_delivery?.sent_to_inbox);
      const inviteLink = data?.invite_link || data?.email_delivery?.invite_link || null;
      const tempPass = data?.temporary_password || password || null;
      const rateLimited = Boolean(data?.email_delivery?.rate_limited);

      if (emailSent) {
        notify('Success', `${fullName} created! Supabase invitation email delivered to ${email}.`);
        resetForm();
        router.back();
      } else {
        setCreatedUser({
          fullName,
          email,
          role: selectedRole,
          temporaryPassword: tempPass,
          inviteLink: inviteLink,
          rateLimited: rateLimited,
          emailSent: false,
        });
      }

    } catch (err: any) {
      console.error('Create User Error:', err);
      notify('Error', err.message || 'Something went wrong. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Create New User" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[600px] w-full mx-auto">

          {/* Basic Info */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4">Basic Information</Text>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Full Name</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter full name"
              value={fullName}
              onChangeText={setFullName}
              {...noAutofill('admin_create_user_fullname')}
            />

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              {...noAutofill('admin_create_user_email', 'email')}
            />

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Password</Text>
            <View className="flex-row items-center border border-gray-200 rounded-lg bg-gray-50 mb-4 pr-3">
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 px-4 py-3 text-sm text-gray-800 outline-none"
                placeholder="Min 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                {...noAutofill('admin_create_user_password', 'new-password')}
              />
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowPassword(!showPassword)}
                className="p-2 min-w-[44px] min-h-[44px] items-center justify-center"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Confirm Password</Text>
            <View className="flex-row items-center border border-gray-200 rounded-lg bg-gray-50 mb-4 pr-3">
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 px-4 py-3 text-sm text-gray-800 outline-none"
                placeholder="Repeat password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                {...noAutofill('admin_create_user_confirmpassword', 'new-password')}
              />
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                className="p-2 min-w-[44px] min-h-[44px] items-center justify-center"
                accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
              >
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            <PhoneInput
              label="Contact Number"
              value={contactNumber}
              onChangePhone={(e164, valid) => {
                setContactNumber(e164);
                setIsPhoneValid(valid);
              }}
              required={false}
              placeholder="077 123 4567"
            />
          </View>

          {/* Role Selection */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4">Assign Role</Text>
            <View className="flex-row flex-wrap gap-2">
              {ROLES.map(role => (
                <Pressable style={{ minHeight: 44, minWidth: 44 }}
                  key={role.value}
                  onPress={() => setSelectedRole(role.value)}
                  className={`px-4 py-2 rounded-lg border ${
                    selectedRole === role.value
                      ? 'bg-brand-orange border-brand-orange'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${
                    selectedRole === role.value ? 'text-white' : 'text-gray-600'
                  }`}>
                    {role.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Worker Specific Fields */}
          {selectedRole === 'worker' && (
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4">Worker Details</Text>

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-2">Worker Type</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {WORKER_TYPES.map(type => (
                  <Pressable style={{ minHeight: 44, minWidth: 44 }}
                    key={type}
                    onPress={() => setWorkerType(type)}
                    className={`px-3 py-2 rounded-lg border ${
                      workerType === type
                        ? 'bg-brand-orange border-brand-orange'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-xs font-semibold ${
                      workerType === type ? 'text-white' : 'text-gray-600'
                    }`}>
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <AmountInput
                label="Daily Rate"
                prefix="Rs."
                value={dailyRate}
                onChangeValue={(val) => setDailyRate(val)}
                placeholder="2,500"
                allowDecimals={false}
              />
            </View>
          )}

          {/* Submit */}
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={handleCreate}
            disabled={loading}
            className="bg-brand-orange rounded-xl py-4 items-center mb-8 shadow-sm"
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Create User</Text>
            }
          </Pressable>

        </View>
      </ScrollView>

      {/* Created User Credentials Modal */}
      {createdUser && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setCreatedUser(null);
            resetForm();
            router.back();
          }}
        >
          <ModalViewport>
            <View className="bg-white max-h-full w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-gray-100">
              
              {/* Header */}
              <View className="p-5 border-b border-gray-100 bg-orange-50/60 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center">
                    <Ionicons name="checkmark-circle" size={24} color="#EA580C" />
                  </View>
                  <View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-900">
                      User Account Created
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-gray-500">
                      Account successfully created in Supabase Auth
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => {
                    setCreatedUser(null);
                    resetForm();
                    router.back();
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 items-center justify-center"
                >
                  <Ionicons name="close" size={22} color="#6B7280" />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }} style={{ flexShrink: 1 }}>
                
                {/* Rate limit status alert */}
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 flex-row items-start gap-2.5">
                  <Ionicons name="information-circle" size={20} color="#D97706" style={{ marginTop: 2 }} />
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-amber-900 mb-0.5">
                      {createdUser.rateLimited ? 'Supabase Rate Limit Reached (3 emails/hr)' : 'Account Ready'}
                    </Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs text-amber-800 leading-relaxed">
                      {createdUser.rateLimited
                        ? 'Supabase default free mailer limit was hit. A verified cryptographic invite link was generated below so the user can activate their account immediately.'
                        : 'Credentials are ready to share with the user or sign in.'}
                    </Text>
                  </View>
                </View>

                {/* Account Details Box */}
                <View className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
                  <View className="flex-row justify-between items-center py-2 border-b border-gray-200/70">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500">Full Name</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-gray-800">{createdUser.fullName}</Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-b border-gray-200/70">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500">Assigned Role</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-brand-orange">
                      {ROLES.find(r => r.value === createdUser.role)?.label || createdUser.role}
                    </Text>
                  </View>

                  <View className="flex-row justify-between items-center py-2 border-b border-gray-200/70">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500">Login Email</Text>
                    <Pressable
                      style={{ minHeight: 36, minWidth: 36 }}
                      onPress={() => handleCopy(createdUser.email, 'Email')}
                      className="flex-row items-center gap-1.5"
                    >
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-mono font-medium text-gray-800">{createdUser.email}</Text>
                      <Ionicons name={copiedField === 'Email' ? 'checkmark' : 'copy-outline'} size={14} color="#EA580C" />
                    </Pressable>
                  </View>

                  {createdUser.temporaryPassword && (
                    <View className="flex-row justify-between items-center py-2">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500">Temporary Password</Text>
                      <Pressable
                        style={{ minHeight: 36, minWidth: 36 }}
                        onPress={() => handleCopy(createdUser.temporaryPassword!, 'Password')}
                        className="flex-row items-center gap-1.5 bg-orange-100/70 px-2.5 py-1 rounded-md"
                      >
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-mono font-bold text-brand-orange">
                          {createdUser.temporaryPassword}
                        </Text>
                        <Ionicons name={copiedField === 'Password' ? 'checkmark' : 'copy-outline'} size={14} color="#EA580C" />
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Direct Supabase Invite Link Card */}
                {createdUser.inviteLink && (
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5">
                    <View className="flex-row justify-between items-center mb-1.5">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-bold text-slate-800">
                        Direct Supabase Invite Link
                      </Text>
                      <Pressable
                        style={{ minHeight: 36, minWidth: 36 }}
                        onPress={() => handleCopy(createdUser.inviteLink!, 'Invite Link')}
                        className="flex-row items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-200"
                      >
                        <Ionicons name={copiedField === 'Invite Link' ? 'checkmark' : 'copy-outline'} size={13} color="#0F172A" />
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-slate-700">
                          {copiedField === 'Invite Link' ? 'Copied' : 'Copy Link'}
                        </Text>
                      </Pressable>
                    </View>
                    <Text
                      numberOfLines={3}
                      style={{ flexShrink: 1, minWidth: 0 }}
                      maxFontSizeMultiplier={1.3}
                      className="text-[11px] text-slate-500 font-mono break-all"
                    >
                      {createdUser.inviteLink}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <Pressable
                  style={{ minHeight: 44, minWidth: 44 }}
                  onPress={handleCopyAll}
                  className="w-full bg-brand-orange rounded-xl py-3.5 items-center justify-center flex-row gap-2 mb-3 shadow-sm"
                >
                  <Ionicons name="copy-outline" size={18} color="white" />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">
                    {copiedField === 'Account details' ? 'Copied All to Clipboard!' : 'Copy All Credentials & Link'}
                  </Text>
                </Pressable>

                <Pressable
                  style={{ minHeight: 44, minWidth: 44 }}
                  onPress={() => {
                    setCreatedUser(null);
                    resetForm();
                    router.back();
                  }}
                  className="w-full border border-gray-200 rounded-xl py-3 items-center justify-center"
                >
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-semibold text-sm">
                    Done
                  </Text>
                </Pressable>

              </ScrollView>
            </View>
          </ModalViewport>
        </Modal>
      )}
    </View>
  );
}