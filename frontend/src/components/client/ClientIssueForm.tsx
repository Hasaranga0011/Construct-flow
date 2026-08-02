import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_ISSUES = [
  { id: 'IS-001', title: 'Cracked tile in lobby', category: 'Quality', date: 'Oct 15', status: 'Resolved' },
  { id: 'IS-002', title: 'Concern about material delay', category: 'Delay', date: 'Nov 02', status: 'Under Review' },
];

export const ClientIssueForm = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Quality');
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = () => {
    if (title.trim() && description.trim()) {
      setShowToast(true);
      setTitle('');
      setDescription('');
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  return (
    <View className="flex-1 flex-row">
      {/* Left: Form */}
      <View className="flex-[2] bg-white rounded-xl shadow-sm border border-gray-100 p-6 mr-6 h-full">
        <Text className="text-lg font-bold text-brand-text mb-1">Raise a Concern</Text>
        <Text className="text-gray-500 text-xs mb-6">Your project manager will be notified instantly.</Text>
        
        {showToast && (
          <View className="bg-green-50 border border-green-200 p-3 rounded-lg mb-4 flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 8 }} />
            <Text className="text-green-800 text-sm font-semibold">Issue submitted successfully!</Text>
          </View>
        )}

        <View className="mb-4">
          <Text className="text-brand-text font-semibold text-sm mb-2">Issue Title</Text>
          <TextInput 
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-gray-50 text-brand-text focus:border-brand-orange outline-none"
            placeholder="E.g., Concern about recent progress"
            value={title}
            onChangeText={setTitle}
            style={{ outlineStyle: 'none' } as any}
          />
        </View>

        <View className="mb-4">
          <Text className="text-brand-text font-semibold text-sm mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2">
            {['Quality', 'Delay', 'Safety', 'Payment', 'Other'].map(cat => (
              <Pressable 
                key={cat}
                onPress={() => setCategory(cat)}
                className={`px-4 py-2 rounded-full border ${category === cat ? 'bg-orange-50 border-brand-orange' : 'bg-white border-gray-300'}`}
              >
                <Text className={`text-xs font-semibold ${category === cat ? 'text-brand-orange' : 'text-gray-600'}`}>{cat}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-brand-text font-semibold text-sm mb-2">Description</Text>
          <TextInput 
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-gray-50 text-brand-text focus:border-brand-orange h-32 text-left outline-none"
            placeholder="Please describe the issue in detail..."
            multiline
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            style={{ outlineStyle: 'none' } as any}
          />
        </View>

        <View className="flex-row justify-between items-center">
          <Pressable className="flex-row items-center border border-gray-300 px-4 py-3 rounded-lg bg-white hover:bg-gray-50">
            <Ionicons name="camera-outline" size={18} color="#4B5563" style={{ marginRight: 8 }} />
            <Text className="text-gray-700 font-semibold text-sm">Attach Photo</Text>
          </Pressable>
          
          <Pressable 
            onPress={handleSubmit}
            className={`px-8 py-3 rounded-lg flex-row items-center shadow-sm transition-opacity ${title && description ? 'bg-brand-orange' : 'bg-gray-300'}`}
            disabled={!title || !description}
          >
            <Text className="text-white font-bold text-sm mr-2">Submit Issue</Text>
            <Ionicons name="paper-plane" size={16} color="white" />
          </Pressable>
        </View>
      </View>

      {/* Right: History & Scheduler */}
      <View className="flex-[1] flex-col h-full gap-6">
        
        {/* Issue History */}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-[1]">
          <Text className="text-base font-bold text-brand-text mb-4">Past Issues</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {MOCK_ISSUES.map((issue, i) => (
              <View key={issue.id} className={`py-3 ${i !== MOCK_ISSUES.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <Text className="font-semibold text-brand-text text-sm mb-1">{issue.title}</Text>
                <View className="flex-row justify-between items-center mt-1">
                  <Text className="text-gray-400 text-[10px]">{issue.date} • {issue.category}</Text>
                  <View className={`px-2 py-0.5 rounded ${issue.status === 'Resolved' ? 'bg-green-50' : 'bg-orange-50'}`}>
                    <Text className={`text-[10px] font-bold ${issue.status === 'Resolved' ? 'text-green-700' : 'text-orange-700'}`}>
                      {issue.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Meeting Scheduler */}
        <View className="bg-brand-dark rounded-xl shadow-lg border border-gray-800 p-5">
          <View className="w-10 h-10 bg-white/10 rounded-full items-center justify-center mb-3">
            <Ionicons name="calendar" size={20} color="#F97316" />
          </View>
          <Text className="text-white font-bold text-lg mb-2">Request Site Visit</Text>
          <Text className="text-gray-400 text-xs mb-4">
            Schedule an in-person meeting at the construction site with your Project Manager.
          </Text>
          <Pressable className="bg-brand-orange w-full py-2.5 rounded-lg items-center hover:bg-orange-600 transition-colors">
            <Text className="text-white font-bold text-sm">Schedule Meeting</Text>
          </Pressable>
        </View>
        
      </View>
    </View>
  );
};
