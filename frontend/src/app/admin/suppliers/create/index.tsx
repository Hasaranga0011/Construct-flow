import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../../lib/supabase';

export default function AdminSupplierCreatePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !companyName.trim()) {
      setError('Name, email, phone, and company name are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api'}/clients/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: email.trim(),
          name: fullName.trim(),
          company: companyName.trim(),
          access_level: 'supplier',
          project_id: '' // Not applicable for suppliers right now
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create supplier.');
      }
      
      // Update the contact_number on the created profile (invite API doesn't take phone currently)
      const resJson = await response.json();
      if (resJson.user_id) {
        await supabase.from('profiles').update({ contact_number: phone.trim() }).eq('id', resJson.user_id);
      }

      const message = 'Supplier created and invited successfully.';
      if (Platform.OS === 'web') window.alert(message); else Alert.alert('Success', message);
      router.replace('/admin/suppliers');
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to create supplier.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Create Supplier" showAction={false} />
      <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl w-full mx-auto">
          <Text className="text-xl font-bold text-brand-text mb-6">Supplier Details</Text>
          {error && <Text className="text-red-600 mb-4">{error}</Text>}
          
          <Text className="text-sm font-semibold text-gray-700 mb-2">Contact Name *</Text>
          <TextInput 
            value={fullName} 
            onChangeText={setFullName} 
            placeholder="John Doe" 
            className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" 
          />
          
          <Text className="text-sm font-semibold text-gray-700 mb-2">Email Address *</Text>
          <TextInput 
            value={email} 
            onChangeText={setEmail} 
            placeholder="supplier@example.com" 
            autoCapitalize="none" 
            keyboardType="email-address" 
            className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" 
          />
          
          <Text className="text-sm font-semibold text-gray-700 mb-2">Phone Number *</Text>
          <TextInput 
            value={phone} 
            onChangeText={setPhone} 
            placeholder="+94 77 123 4567" 
            keyboardType="phone-pad" 
            className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-4" 
          />
          
          <Text className="text-sm font-semibold text-gray-700 mb-2">Company Name *</Text>
          <TextInput 
            value={companyName} 
            onChangeText={setCompanyName} 
            placeholder="ABC Construction Supplies" 
            className="border border-gray-300 rounded-xl p-4 bg-gray-50 text-brand-text mb-6" 
          />
          
          <Pressable onPress={submit} disabled={submitting} className={`rounded-xl py-4 items-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange'}`}>
            {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">Create Supplier</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
