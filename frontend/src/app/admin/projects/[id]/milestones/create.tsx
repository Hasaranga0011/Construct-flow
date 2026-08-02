import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../../../lib/supabase';

export default function AdminMilestoneCreatePage() {
  const { id: projectId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
  });

  const handleSubmit = async () => {
    if (!formData.title || !formData.due_date) {
      alert('Title and Due Date are required');
      return;
    }
    
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to create milestone');
      }
      
      alert('Milestone created successfully!');
      router.back();
    } catch (err: any) {
      alert(err.message || 'Error creating milestone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Add New Milestone" showAction={false} />
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-xl mx-auto w-full">
          <Text className="text-xl font-bold text-gray-800 mb-6">Milestone Details</Text>
          
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Title *</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Foundation Complete"
              value={formData.title}
              onChangeText={(t) => setFormData({...formData, title: t})}
            />
          </View>
          
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Description</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="Detailed description..."
              multiline
              numberOfLines={4}
              value={formData.description}
              onChangeText={(t) => setFormData({...formData, description: t})}
            />
          </View>

          <View className="mb-8">
            <Text className="text-gray-700 font-medium mb-2">Target Date (YYYY-MM-DD) *</Text>
            <TextInput 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="2025-06-01"
              value={formData.due_date}
              onChangeText={(t) => setFormData({...formData, due_date: t})}
            />
          </View>

          <TouchableOpacity 
            onPress={handleSubmit}
            disabled={loading}
            className="bg-brand-orange py-4 rounded-xl items-center flex-row justify-center"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Add Milestone</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
