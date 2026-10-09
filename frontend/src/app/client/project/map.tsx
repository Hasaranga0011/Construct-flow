import { useResponsive } from '../../../hooks/useResponsive';
// Modified for Expo Go mobile compatibility
import React from 'react';
import { View, Text } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
export default function ClientProjectMapPage() {
  const { isMobile } = useResponsive();
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Project Map" showAction={false} />
      <View className={`flex-1 ${isMobile ? 'p-0' : 'p-6'}`}>
        <View className="flex-1 bg-gray-200 justify-center items-center rounded-2xl overflow-hidden border border-gray-100">
          <Ionicons name="map-outline" size={64} color="#9CA3AF" />
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-gray-500 mt-4">Interactive Map View</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-2">Map integrations will appear here</Text>
        </View>
      </View>
    </View>
  );
}
