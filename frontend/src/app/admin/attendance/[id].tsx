import React from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { AttendanceTable } from '@/components/labour/AttendanceTable';

export default function AdminAttendanceProjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View className="flex-1 flex-col bg-gray-50 h-screen overflow-hidden">
      <TopNav title="Project Attendance Logs" showAction={false} />
      
      <ScrollView className="flex-1 px-8 py-6" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} className="flex-row items-center mb-6 self-start">
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text className="text-gray-500 font-semibold ml-2">Back to Sites</Text>
        </Pressable>
        
        <View className="flex-1 h-full min-h-[600px]">
          <AttendanceTable pmId={id} />
        </View>
      </ScrollView>
    </View>
  );
}
