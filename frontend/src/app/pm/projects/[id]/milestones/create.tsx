import { api } from '@/services/api';
import { notify } from '@/utils/notify';
import { validReportDate } from '@/utils/siteWorkflow';
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';

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
    if (loading) return;
    if (!formData.title.trim() || !validReportDate(formData.due_date)) {
      notify('Check details', 'Enter a title and a valid date (YYYY-MM-DD).');
      return;
    }
    
    setLoading(true);
    try {
      await api.post(`/projects/${projectId}/milestones`, { ...formData, title: formData.title.trim(), description: formData.description.trim() });
      notify('Saved', 'Milestone created successfully!');
      router.back();
    } catch (err: any) {
      notify('Error', err.message || 'Error creating milestone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Add New Milestone" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8 max-w-xl mx-auto w-full">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-800 mb-6">Milestone Details</Text>
          
          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Title *</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="e.g. Foundation Complete"
              value={formData.title}
              onChangeText={(t) => setFormData({...formData, title: t})}
            />
          </View>
          
          <View className="mb-4">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Description</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="Detailed description..."
              multiline
              numberOfLines={4}
              value={formData.description}
              onChangeText={(t) => setFormData({...formData, description: t})}
            />
          </View>

          <View className="mb-8">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-medium mb-2">Target Date (YYYY-MM-DD) *</Text>
            <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} 
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800"
              placeholder="2025-06-01"
              value={formData.due_date}
              onChangeText={(t) => setFormData({...formData, due_date: t})}
            />
          </View>

          <TouchableOpacity style={{ minHeight: 44, minWidth: 44 }} 
            onPress={handleSubmit}
            disabled={loading}
            className="bg-brand-orange py-4 rounded-xl items-center flex-row justify-center"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Add Milestone</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
