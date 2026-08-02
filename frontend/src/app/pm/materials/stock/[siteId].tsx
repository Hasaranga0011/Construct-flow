import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TopNav } from '@/components/common/TopNav';

export default function PmMaterialsStockSiteidPage() {
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Pm Materials Stock Siteid" showAction={false} />
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <Text className="text-xl font-bold text-gray-800">Pm Materials Stock Siteid</Text>
          <Text className="text-gray-500 mt-2">Page stub generated successfully.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
