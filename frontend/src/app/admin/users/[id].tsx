import { getApiUrl } from '../../../lib/apiUrl';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { notify, confirmAction } from '@/utils/notify';
import { noAutofill } from '@/lib/formAutofill';
import { PhoneInput } from '@/components/common/PhoneInput';
import { AmountInput } from '@/components/common/AmountInput';

import { RoleAvatar } from '@/components/common/RoleAvatar';

const ROLES = [
  { label: 'Admin', value: 'super_admin' },
  { label: 'Project Manager', value: 'pm' },
  { label: 'Site Manager', value: 'site_manager' },
  { label: 'Client', value: 'client' },
  { label: 'Worker', value: 'worker' },
  { label: 'Supplier', value: 'supplier' },
];

const WORKER_TYPES = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'General Laborer'];

export default function AdminUsersEditPage() {
  const { id } = useLocalSearchParams();
  const userId = Array.isArray(id) ? id[0] : (id || '');
  const router = useRouter();
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState('pm');
  const [contactNumber, setContactNumber] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [workerType, setWorkerType] = useState('General Laborer');
  const [dailyRate, setDailyRate] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    // Reset state every time the user ID changes so previous data never carries over
    setInitialLoading(true);
    setFullName('');
    setEmail('');
    setAvatarUrl(null);
    setSelectedRole('');
    setContactNumber('');
    setWorkerType('General Laborer');
    setDailyRate(null);

    const fetchUser = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) throw error;
        
        if (data && isMounted) {
          setFullName(data.full_name || '');
          setEmail(data.email || '');
          setAvatarUrl(data.avatar_url || null);
          setSelectedRole(data.role || 'pm');
          setContactNumber(data.contact_number || '');
          if (data.role === 'worker') {
            setWorkerType(data.worker_type || 'General Laborer');
            setDailyRate(data.daily_rate !== null && data.daily_rate !== undefined ? Number(data.daily_rate) : null);
          }
        }
      } catch (err: any) {
        notify('Error', err.message || 'Failed to fetch user profile.');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };
    
    if (!userId) return;
    if (id) fetchUser();
    return () => { isMounted = false; };
  }, [userId]);

  const handleDelete = async () => {
    if (!userId) return;
    const confirmed = await confirmAction('Delete User', 'Are you sure you want to completely delete this user account? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${getApiUrl()}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete user');
      }
      
      notify('Success', 'User has been removed successfully.');
      router.back();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to delete user.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!fullName) {
      notify('Error', 'Name is required.');
      return;
    }

    if (contactNumber && !isPhoneValid) {
      notify('Error', 'Please enter a valid Sri Lankan phone number (e.g. 077 123 4567).');
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await (supabase.rpc as any)('update_user_role', {
        target_user_id: userId,
        new_role: selectedRole,
        new_worker_type: selectedRole === 'worker' ? workerType : null,
        new_daily_rate: selectedRole === 'worker' ? dailyRate : null
      });

      if (profileError) throw profileError;

      // Also update full_name/contact_number using standard update since those columns have permissions
      await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          contact_number: contactNumber || null
        })
        .eq('id', userId);

      notify('Success', 'User profile updated successfully!');
      router.back();

    } catch (err: any) {
      notify('Error', err.message || 'Something went wrong while saving.');
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
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="max-w-[600px] w-full mx-auto">

          {/* User Profile Header Card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4 flex-row items-center gap-4">
            <RoleAvatar
              avatarUrl={avatarUrl}
              role={selectedRole}
              name={fullName || email}
              size="lg"
              showRoleBadge
            />
            <View className="flex-1 min-w-0">
              <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-900">{fullName || 'Unnamed User'}</Text>
              <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-sm text-gray-500 mt-0.5">{email || 'No email'}</Text>
              <View className="mt-2 flex-row items-center">
                <View className="px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 self-start">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-brand-orange uppercase">{selectedRole.replace('_', ' ')}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Basic Info */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-gray-800 mb-4">Basic Information</Text>

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Full Name</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4 bg-gray-50"
              placeholder="Enter full name"
              value={fullName}
              onChangeText={setFullName}
              {...noAutofill('admin_edit_user_fullname')}
            />

            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
              className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 mb-4 bg-gray-100"
              value={email || 'No email associated'}
              editable={false}
              {...noAutofill('admin_edit_user_email', 'email')}
            />

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
            onPress={handleSave}
            disabled={saving || isDeleting}
            className="bg-brand-orange rounded-xl py-4 items-center mb-4 shadow-sm"
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Save Changes</Text>
            }
          </Pressable>

          {/* Delete */}
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            onPress={handleDelete}
            disabled={saving || isDeleting}
            className="bg-white border border-red-200 rounded-xl py-4 items-center mb-8 shadow-sm"
          >
            {isDeleting
              ? <ActivityIndicator color="#ef4444" />
              : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 font-bold text-base">Delete User</Text>
            }
          </Pressable>
        
        </View>
      </ScrollView>
    </View>
  );
}
