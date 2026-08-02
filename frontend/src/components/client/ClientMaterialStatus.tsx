import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const MOCK_MATERIALS = [
  { id: 1, name: 'Cement (Tokyo Super)', status: 'On Site', qty: '150 bags', type: 'success' },
  { id: 2, name: 'Steel Rebar (12mm)', status: 'In Transit', qty: '2 Tons', type: 'warning' },
  { id: 3, name: 'River Sand', status: 'Pending Order', qty: '4 Cubes', type: 'danger' },
];

export const ClientMaterialStatus = () => {
  return (
    <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-base font-bold text-brand-text">Material Status</Text>
        <Text className="text-brand-orange text-xs font-semibold">View All</Text>
      </View>
      
      {MOCK_MATERIALS.map((item, index) => (
        <View 
          key={item.id} 
          className={`flex-row justify-between items-center py-3 ${index !== MOCK_MATERIALS.length - 1 ? 'border-b border-gray-50' : ''}`}
        >
          <View className="flex-row items-center flex-1">
            <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
              item.type === 'success' ? 'bg-green-50' : item.type === 'warning' ? 'bg-orange-50' : 'bg-red-50'
            }`}>
              <MaterialCommunityIcons 
                name={item.type === 'success' ? 'package-variant' : item.type === 'warning' ? 'truck-delivery' : 'clock-alert'} 
                size={16} 
                color={item.type === 'success' ? '#16A34A' : item.type === 'warning' ? '#F97316' : '#DC2626'} 
              />
            </View>
            <View>
              <Text className="text-brand-text font-semibold text-sm">{item.name}</Text>
              <Text className="text-gray-500 text-xs">{item.qty}</Text>
            </View>
          </View>
          
          <View className={`px-2 py-1 rounded-md ${
            item.type === 'success' ? 'bg-green-100' : item.type === 'warning' ? 'bg-orange-100' : 'bg-red-100'
          }`}>
            <Text className={`text-[10px] font-bold ${
              item.type === 'success' ? 'text-green-700' : item.type === 'warning' ? 'text-orange-700' : 'text-red-700'
            }`}>
              {item.status}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};
