import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '@/utils/notify';

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
  const [selectedRole, setSelectedRole] = useState('pm');
  const [contactNumber, setContactNumber] = useState('');
  const [workerType, setWorkerType] = useState('General Laborer');
  const [dailyRate, setDailyRate] = useState('');

  const handleCreate = async () => {
    if (!fullName || !email || !password) {
      notify('Error', 'Name, email and password are required.');
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

    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const payload = {
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        role: selectedRole,
        send_email: true,
        worker_type: selectedRole === 'worker' ? workerType : null,
        daily_rate: selectedRole === 'worker' ? (parseFloat(dailyRate) || 0) : null
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

      // Also update contact number since it's not in the main payload
      const responseData = await response.json();
      if (contactNumber) {
        await supabase
          .from('profiles')
          .update({ contact_number: contactNumber })
          .eq('id', responseData.id);
      }

      notify('Success', `${fullName} account created successfully! Credentials emailed.`);
      router.back();

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
            />

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Password</Text>
            <View className="flex-row items-center border border-gray-200 rounded-lg bg-gray-50 mb-4 pr-3">
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="flex-1 px-4 py-3 text-sm text-gray-800 outline-none"
                placeholder="Min 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
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
              />
              <Pressable style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                className="p-2 min-w-[44px] min-h-[44px] items-center justify-center"
                accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
              >
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Contact Number</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
              placeholder="Enter contact number (optional)"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
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

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Daily Rate (LKR)</Text>
              <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
                className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                placeholder="e.g. 2500"
                value={dailyRate}
                onChangeText={setDailyRate}
                keyboardType="numeric"
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
    </View>
  );
}