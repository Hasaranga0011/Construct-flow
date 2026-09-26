import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '../../../../../lib/toast';

export default function AdminCreateExpensePage() {
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();
  
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.title || !form.amount) {
      toast.error('Title and Amount are required');
      return;
    }

    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      
      const payload = {
        project_id: projectId,
        title: form.title,
        description: form.description || null,
        amount: parseFloat(form.amount),
        expense_date: form.expense_date
      };

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects/${projectId}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to create expense");
      }
      
      toast.success('Expense added successfully');
      router.back();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-dark">
      <TopNav title="Add Expense" showBackButton />
      
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-3xl p-6 shadow-sm mb-10">
          
          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-2">Expense Title *</Text>
            <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <Ionicons name="pricetag-outline" size={20} color="#9CA3AF" className="mr-3" />
              <TextInput
                className="flex-1 text-gray-800 font-medium"
                placeholder="e.g., Cement Bags, Site Equipment"
                placeholderTextColor="#9CA3AF"
                value={form.title}
                onChangeText={(t) => setForm({...form, title: t})}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-2">Amount (Rs.) *</Text>
            <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <Ionicons name="cash-outline" size={20} color="#EF4444" className="mr-3" />
              <TextInput
                className="flex-1 text-gray-800 font-medium"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={form.amount}
                onChangeText={(t) => setForm({...form, amount: t})}
              />
            </View>
          </View>
          
          <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-2">Expense Date *</Text>
            <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <Ionicons name="calendar-outline" size={20} color="#9CA3AF" className="mr-3" />
              <TextInput
                className="flex-1 text-gray-800 font-medium"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                value={form.expense_date}
                onChangeText={(t) => setForm({...form, expense_date: t})}
              />
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-gray-700 font-bold mb-2">Description (Optional)</Text>
            <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 min-h-[100px]">
              <TextInput
                className="flex-1 text-gray-800 font-medium text-left align-top"
                placeholder="Add any extra details about this expense..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={form.description}
                onChangeText={(t) => setForm({...form, description: t})}
                style={{ textAlignVertical: 'top' }}
              />
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            className={`py-4 rounded-xl items-center flex-row justify-center ${loading ? 'bg-brand-orange/70' : 'bg-brand-orange'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" className="mr-2" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={24} color="white" className="mr-2" />
            )}
            <Text className="text-white font-bold text-lg">Save Expense</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
