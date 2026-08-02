import React, { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_GALLERY = [
  { id: 1, type: 'photo', stage: 'Foundation', uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=600', date: 'Oct 05, 2026' },
  { id: 2, type: 'photo', stage: 'Foundation', uri: 'https://images.unsplash.com/photo-1504307651254-35680f356f12?q=80&w=600', date: 'Oct 10, 2026' },
  { id: 3, type: 'photo', stage: 'Structure', uri: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=600', date: 'Nov 02, 2026' },
  { id: 4, type: 'photo', stage: 'Structure', uri: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=600', date: 'Nov 15, 2026' },
  { id: 5, type: 'video', stage: 'Overview', uri: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=600', date: 'Nov 20, 2026', title: 'Site Drone Footage' },
  { id: 6, type: 'photo', stage: 'Structure', uri: 'https://images.unsplash.com/photo-1508450859948-4e04fabaa4ea?q=80&w=600', date: 'Dec 01, 2026' },
];

export const ClientMediaGallery = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'foundation' | 'structure' | 'videos' | 'before-after'>('all');
  const [sliderPos, setSliderPos] = useState(50); // % for before/after

  const getFilteredMedia = () => {
    if (activeTab === 'all') return MOCK_GALLERY;
    if (activeTab === 'videos') return MOCK_GALLERY.filter(m => m.type === 'video');
    return MOCK_GALLERY.filter(m => m.stage.toLowerCase() === activeTab && m.type === 'photo');
  };

  const filteredMedia = getFilteredMedia();

  return (
    <View className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Tabs */}
      <View className="flex-row mb-6 border-b border-gray-100 pb-2 overflow-x-auto">
        <Pressable onPress={() => setActiveTab('all')} className={`mr-6 pb-2 ${activeTab === 'all' ? 'border-b-2 border-brand-orange' : ''}`}>
          <Text className={`font-semibold ${activeTab === 'all' ? 'text-brand-orange' : 'text-gray-500'}`}>All Media</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('foundation')} className={`mr-6 pb-2 ${activeTab === 'foundation' ? 'border-b-2 border-brand-orange' : ''}`}>
          <Text className={`font-semibold ${activeTab === 'foundation' ? 'text-brand-orange' : 'text-gray-500'}`}>Foundation</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('structure')} className={`mr-6 pb-2 ${activeTab === 'structure' ? 'border-b-2 border-brand-orange' : ''}`}>
          <Text className={`font-semibold ${activeTab === 'structure' ? 'text-brand-orange' : 'text-gray-500'}`}>Structure</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('videos')} className={`mr-6 pb-2 ${activeTab === 'videos' ? 'border-b-2 border-brand-orange' : ''}`}>
          <Text className={`font-semibold ${activeTab === 'videos' ? 'text-brand-orange' : 'text-gray-500'}`}>Videos</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('before-after')} className={`pb-2 ${activeTab === 'before-after' ? 'border-b-2 border-brand-orange' : ''}`}>
          <Text className={`font-semibold ${activeTab === 'before-after' ? 'text-brand-orange' : 'text-gray-500'}`}>Before / After</Text>
        </Pressable>
      </View>

      {/* Grid Area */}
      {activeTab === 'before-after' ? (
        <View className="flex-1 rounded-xl overflow-hidden relative bg-gray-900 min-h-[400px]">
          {/* After (Current) */}
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=1200' }} 
            className="absolute inset-0 w-full h-full" 
            resizeMode="cover"
          />
          {/* Before (Day 1) - clipped */}
          <View className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=1200' }} 
              className="w-[100vw] max-w-[1200px] h-full" 
              resizeMode="cover"
            />
          </View>
          
          {/* Slider line & handle (Mock drag interaction by clicking for now) */}
          <View className="absolute top-0 bottom-0 w-1 bg-white items-center justify-center cursor-ew-resize" style={{ left: `${sliderPos}%`, marginLeft: -2 }}>
            <View className="w-8 h-8 bg-white rounded-full shadow-lg items-center justify-center border border-gray-200">
              <Ionicons name="swap-horizontal" size={16} color="#F97316" />
            </View>
          </View>

          {/* Labels */}
          <View className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded backdrop-blur-sm">
            <Text className="text-white font-bold text-xs uppercase tracking-wider">Day 1</Text>
          </View>
          <View className="absolute top-4 right-4 bg-black/60 px-3 py-1 rounded backdrop-blur-sm">
            <Text className="text-white font-bold text-xs uppercase tracking-wider">Today</Text>
          </View>
          
          {/* Interactive touch zones for slider demo */}
          <View className="absolute inset-0 flex-row opacity-0">
             <Pressable className="flex-1" onPress={() => setSliderPos(25)} />
             <Pressable className="flex-1" onPress={() => setSliderPos(50)} />
             <Pressable className="flex-1" onPress={() => setSliderPos(75)} />
          </View>
        </View>
      ) : (
        <ScrollView className="flex-1 -mx-2" showsVerticalScrollIndicator={false}>
          <View className="flex-row flex-wrap">
            {filteredMedia.map(item => (
              <View key={item.id} className="w-1/3 p-2">
                <View className="rounded-xl overflow-hidden bg-gray-100 aspect-video relative group border border-gray-100 cursor-pointer">
                  <Image source={{ uri: item.uri }} className="w-full h-full" />
                  
                  {item.type === 'video' && (
                    <View className="absolute inset-0 bg-black/30 items-center justify-center group-hover:bg-black/40 transition-colors">
                      <View className="w-12 h-12 bg-white/90 rounded-full items-center justify-center shadow-lg">
                        <Ionicons name="play" size={24} color="#F97316" style={{ marginLeft: 4 }} />
                      </View>
                    </View>
                  )}
                  
                  {/* Overlay Info */}
                  <View className="absolute inset-x-0 bottom-0 bg-black/60 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <Text className="text-white font-bold text-sm" numberOfLines={1}>{item.title || item.stage}</Text>
                    <Text className="text-gray-300 text-xs">{item.date}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
