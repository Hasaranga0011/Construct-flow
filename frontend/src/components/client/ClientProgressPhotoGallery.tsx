import React from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_PHOTOS = [
  { id: 1, stage: 'Foundation', uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=400', date: '2 days ago' },
  { id: 2, stage: 'Structure', uri: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=400', date: 'Yesterday' },
  { id: 3, stage: 'Structure', uri: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=400', date: 'Today' },
];

export const ClientProgressPhotoGallery = () => {
  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px]">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Recent Progress Photos</Text>
          <Text className="text-gray-500 text-xs">Latest updates from the site</Text>
        </View>
        <Pressable className="bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
          <Text className="text-brand-text font-semibold text-xs">View Gallery</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-2">
        {MOCK_PHOTOS.map((photo, index) => (
          <View key={photo.id} className="px-2 w-64">
            <View className="rounded-xl overflow-hidden h-40 relative group">
              <Image source={{ uri: photo.uri }} className="w-full h-full" />
              <View className="absolute inset-0 bg-black/20" />
              <View className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded">
                <Text className="text-[10px] font-bold text-brand-text">{photo.stage}</Text>
              </View>
              <View className="absolute top-3 right-3 bg-black/50 px-2 py-1 rounded flex-row items-center">
                <Ionicons name="time-outline" size={10} color="white" style={{ marginRight: 4 }} />
                <Text className="text-[10px] text-white font-medium">{photo.date}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};
