import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

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
  const [selectedRole, setSelectedRole] = useState('pm');
  const [contactNumber, setContactNumber] = useState('');
  const [workerType, setWorkerType] = useState('General Laborer');
  const [dailyRate, setDailyRate] = useState('');

  const handleCreate = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Name, email and password are required.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create auth user via Supabase Admin
      // Sign-up must not replace the administrator's session.
      const signupClient = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: authData, error: authError } = await signupClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'client',
          }
        }
      });

      if (authError) throw authError;
      if (!authData || !authData.user) throw new Error('User creation failed.');

      const { error: profileError } = await supabase.rpc('update_user_role', {
        target_user_id: authData.user.id,
        new_role: selectedRole,
        new_worker_type: selectedRole === 'worker' ? workerType : null,
        new_daily_rate: selectedRole === 'worker' ? (parseFloat(dailyRate) || 0) : null
      });

      if (profileError) throw profileError;

      // Update remaining non-restricted columns
      await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          email,
          contact_number: contactNumber || null
        })
        .eq('id', authData.user.id);

      Alert.alert('Success', `${fullName} account created successfully!`);
      router.back();

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Create New User" showAction={false} />
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[600px] w-full mx-auto">

          {/* Basic Info */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <Text className="text-lg font-bold text-gray-800 mb-4">Basic Information</Text>

            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Full Name</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter full name"
              value={fullName}
              onChangeText={setFullName}
            />

            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Password</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Min 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Contact Number</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
              placeholder="Enter contact number (optional)"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
            />
          </View>

          {/* Role Selection */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <Text className="text-lg font-bold text-gray-800 mb-4">Assign Role</Text>
            <View className="flex-row flex-wrap gap-2">
              {ROLES.map(role => (
                <Pressable
                  key={role.value}
                  onPress={() => setSelectedRole(role.value)}
                  className={`px-4 py-2 rounded-lg border ${
                    selectedRole === role.value
                      ? 'bg-brand-orange border-brand-orange'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${
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
              <Text className="text-lg font-bold text-gray-800 mb-4">Worker Details</Text>

              <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">Worker Type</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {WORKER_TYPES.map(type => (
                  <Pressable
                    key={type}
                    onPress={() => setWorkerType(type)}
                    className={`px-3 py-2 rounded-lg border ${
                      workerType === type
                        ? 'bg-brand-orange border-brand-orange'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${
                      workerType === type ? 'text-white' : 'text-gray-600'
                    }`}>
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Daily Rate (LKR)</Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50"
                placeholder="e.g. 2500"
                value={dailyRate}
                onChangeText={setDailyRate}
                keyboardType="numeric"
              />
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleCreate}
            disabled={loading}
            className="bg-brand-orange rounded-xl py-4 items-center mb-8 shadow-sm"
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text className="text-white font-bold text-base">Create User</Text>
            }
          </Pressable>
        
        </View>
      </ScrollView>
    </View>
  );
}