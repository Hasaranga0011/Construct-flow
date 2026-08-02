import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_INVOICES = [
  { id: 'INV-001', date: 'Oct 15, 2026', amount: 'Rs. 2,500,000', status: 'Paid', title: 'Foundation Advance' },
  { id: 'INV-002', date: 'Nov 20, 2026', amount: 'Rs. 3,200,000', status: 'Paid', title: 'Superstructure Phase 1' },
  { id: 'INV-003', date: 'Dec 15, 2026', amount: 'Rs. 2,500,000', status: 'Pending', title: 'Superstructure Phase 2' },
];

export const ClientInvoiceList = () => {
  return (
    <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold text-brand-text">Invoices</Text>
        <Text className="text-brand-orange text-xs font-semibold">View All</Text>
      </View>

      {MOCK_INVOICES.map((inv, index) => (
        <View key={inv.id} className={`py-4 flex-row justify-between items-center ${index !== MOCK_INVOICES.length - 1 ? 'border-b border-gray-50' : ''}`}>
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 bg-gray-50 rounded-lg items-center justify-center mr-4 border border-gray-100">
              <Ionicons name="document-text-outline" size={20} color="#6B7280" />
            </View>
            <View>
              <Text className="font-bold text-brand-text text-sm mb-0.5">{inv.title}</Text>
              <View className="flex-row items-center">
                <Text className="text-gray-500 text-xs mr-2">{inv.id}</Text>
                <Text className="text-gray-400 text-xs">• {inv.date}</Text>
              </View>
            </View>
          </View>
          
          <View className="items-end">
            <Text className="font-bold text-brand-text mb-1">{inv.amount}</Text>
            <View className={`px-2 py-0.5 rounded ${inv.status === 'Paid' ? 'bg-green-50' : 'bg-orange-50'}`}>
              <Text className={`text-[10px] font-bold ${inv.status === 'Paid' ? 'text-green-600' : 'text-orange-600'}`}>
                {inv.status}
              </Text>
            </View>
          </View>
          
          <Pressable className="ml-4 p-2 hover:bg-gray-50 rounded-full">
            <Ionicons name="download-outline" size={18} color="#6B7280" />
          </Pressable>
        </View>
      ))}
    </View>
  );
};
