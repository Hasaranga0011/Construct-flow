import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getDashboardForRole } from '@/utils/auth';

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, role, isApproved, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleCheckStatus = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_approved')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        if (data.role && data.role !== 'pending' && data.is_approved !== false) {
          const target = getDashboardForRole(data.role);
          if (target) {
            router.replace(target as any);
            return;
          }
        }
      }
    } catch (e) {
      console.error('Error rechecking status:', e);
    } finally {
      setChecking(false);
    }
  };

  const isSupplierPending = role === 'supplier' && isApproved === false;

  return (
    <View className="flex-1 bg-gray-50 items-center justify-center p-6">
      <View className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 items-center text-center">
        <View className="w-16 h-16 rounded-full bg-amber-100 items-center justify-center mb-6">
          <Ionicons name="time-outline" size={36} color="#D97706" />
        </View>

        <Text
          maxFontSizeMultiplier={1.3}
          style={{ flexShrink: 1, minWidth: 0 }}
          className="text-2xl font-bold text-gray-900 mb-2 text-center"
        >
          {isSupplierPending ? 'Supplier Approval Pending' : 'Account Verification Pending'}
        </Text>

        <Text
          maxFontSizeMultiplier={1.3}
          style={{ flexShrink: 1, minWidth: 0 }}
          className="text-sm text-gray-600 mb-6 text-center leading-relaxed"
        >
          {isSupplierPending
            ? 'Your supplier account registration has been received. ConstructFlow administrators review and verify all partner credentials before dashboard access is granted.'
            : 'Your account has been created, but your role assignment is pending review by the system administrator. You will gain access to your dashboard once verified.'}
        </Text>

        <View className="w-full bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, minWidth: 0 }}
            className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold"
          >
            Signed in as
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, minWidth: 0 }}
            className="text-sm font-medium text-gray-800"
          >
            {user?.email}
          </Text>
        </View>

        <Pressable
          style={{ minHeight: 44, minWidth: 44 }}
          onPress={handleCheckStatus}
          disabled={checking}
          className="w-full bg-brand-orange py-3.5 rounded-xl items-center justify-center mb-3 shadow-sm"
        >
          {checking ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ flexShrink: 1, minWidth: 0 }}
              className="text-white font-bold text-base"
            >
              Check Status
            </Text>
          )}
        </Pressable>

        <Pressable
          style={{ minHeight: 44, minWidth: 44 }}
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          className="w-full py-3 rounded-xl items-center justify-center border border-gray-200"
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, minWidth: 0 }}
            className="text-gray-600 font-semibold text-sm"
          >
            Sign Out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
