import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';

const ROLES = [
  { label: 'Admin', value: 'admin' },
  { label: 'Project Manager', value: 'pm' },
  { label: 'Site Manager', value: 'site_manager' },
  { label: 'Client', value: 'client' },
  { label: 'Worker', value: 'worker' },
  { label: 'Supplier', value: 'supplier' },
];

const WORKER_TYPES = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'General Laborer'];

export default function AdminUsersEditPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('pm');
  const [contactNumber, setContactNumber] = useState('');
  const [workerType, setWorkerType] = useState('General Laborer');
  const [dailyRate, setDailyRate] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        
        if (data && isMounted) {
          setFullName(data.full_name || '');
          setEmail(data.email || '');
          setSelectedRole(data.role || 'pm');
          setContactNumber(data.contact_number || '');
          if (data.role === 'worker') {
            setWorkerType(data.worker_type || 'General Laborer');
            setDailyRate(data.daily_rate ? data.daily_rate.toString() : '');
          }
        }
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to fetch user profile.');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };
    
    if (id) fetchUser();
    return () => { isMounted = false; };
  }, [id]);

  const handleDelete = () => {
    const doDelete = async () => {
      setIsDeleting(true);
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/admin/users/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to delete user');
        }
        
        if (Platform.OS === 'web') {
          window.alert('User has been removed successfully.');
        } else {
          Alert.alert('Deleted', 'User has been removed successfully.');
        }
        router.back();
      } catch (err: any) {
        const msg = err.message || 'Failed to delete user. Please ensure the backend function exists.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setIsDeleting(false);
      }
    };

    Alert.alert(
      "Delete User",
      "Are you sure you want to completely delete this user account? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete }
      ]
    );
  };

  const handleSave = async () => {
    if (!fullName) {
      Alert.alert('Error', 'Name is required.');
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await supabase.rpc('update_user_role', {
        target_user_id: id,
        new_role: selectedRole,
        new_worker_type: selectedRole === 'worker' ? workerType : null,
        new_daily_rate: selectedRole === 'worker' ? (parseFloat(dailyRate) || 0) : null
      });

      if (profileError) throw profileError;

      // Also update full_name/contact_number using standard update since those columns have permissions
      await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          contact_number: contactNumber || null
        })
        .eq('id', id);

      Alert.alert('Success', 'User profile updated successfully!');
      router.back();

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong while saving.');
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <View className="flex-1 bg-brand-light items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Manage User" showAction={false} />
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
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 mb-4 bg-gray-100"
              value={email || 'No email associated'}
              editable={false}
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
            onPress={handleSave}
            disabled={saving || isDeleting}
            className="bg-brand-orange rounded-xl py-4 items-center mb-4 shadow-sm"
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text className="text-white font-bold text-base">Save Changes</Text>
            }
          </Pressable>

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            disabled={saving || isDeleting}
            className="bg-white border border-red-200 rounded-xl py-4 items-center mb-8 shadow-sm"
          >
            {isDeleting
              ? <ActivityIndicator color="#ef4444" />
              : <Text className="text-red-500 font-bold text-base">Delete User</Text>
            }
          </Pressable>
        
        </View>
      </ScrollView>
    </View>
  );
}
