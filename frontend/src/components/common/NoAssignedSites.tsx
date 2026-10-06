import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function NoAssignedSites() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <View className="bg-white p-6 rounded-2xl items-center justify-center border border-gray-100 max-w-md w-full shadow-sm">
        <Ionicons name="construct-outline" size={64} color="#9CA3AF" />
        <Text className="text-xl font-bold text-brand-text mt-6 text-center">No Sites Assigned</Text>
        <Text className="text-gray-500 mt-2 text-center">
          You have not been assigned to manage any sites yet. Please contact your project manager or administrator.
        </Text>
      </View>
    </ScrollView>
  );
}
