import React from 'react';
import { View, Text, Image } from 'react-native';

export const ClientWorkerCount = ({ count = 24 }: { count?: number }) => {
  return (
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-3xl font-extrabold text-brand-text mb-1">{count}</Text>
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full bg-brand-success mr-1.5" />
          <Text className="text-brand-text-muted text-xs font-semibold uppercase">Currently On Site</Text>
        </View>
      </View>
      
      {/* Avatar Stack */}
      <View className="flex-row">
        {[1, 2, 3].map((i) => (
          <View 
            key={i} 
            className="w-11 h-11 rounded-full border-2 border-white overflow-hidden bg-gray-200"
            style={{ marginLeft: i === 1 ? 0 : -15 }}
          >
            <Image 
              source={{ uri: `https://i.pravatar.cc/100?img=${i + 10}` }} 
              className="w-full h-full"
            />
          </View>
        ))}
        <View 
          className="w-11 h-11 rounded-full border-2 border-white bg-brand-orange items-center justify-center"
          style={{ marginLeft: -15 }}
        >
          <Text className="text-white text-xs font-bold">+{count - 3}</Text>
        </View>
      </View>
    </View>
  );
};
