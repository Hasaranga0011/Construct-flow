import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const MOCK_DOCS = [
  { id: 1, title: 'Signed Contract Agreement', type: 'pdf', date: 'Sep 15, 2026', category: 'Legal', status: 'Final' },
  { id: 2, title: 'Architectural Blueprints v2', type: 'pdf', date: 'Sep 20, 2026', category: 'Plans', status: 'Approved' },
  { id: 3, title: 'Foundation Inspection Cert', type: 'pdf', date: 'Oct 10, 2026', category: 'Inspections', status: 'Passed' },
  { id: 4, title: 'Site Survey Report', type: 'doc', date: 'Sep 18, 2026', category: 'Reports', status: 'Review' },
  { id: 5, title: 'Snagging List', type: 'list', date: 'Pending completion', category: 'Handover', status: 'Locked' },
  { id: 6, title: 'Equipment Warranties', type: 'zip', date: 'Pending handover', category: 'Handover', status: 'Locked' },
];

export const ClientDocumentList = () => {
  return (
    <View className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-lg font-bold text-brand-text mb-1">Project Documents</Text>
          <Text className="text-gray-500 text-xs">All important files in one place</Text>
        </View>
        <View className="flex-row items-center border border-gray-200 rounded-lg bg-gray-50 px-3 py-2">
          <Ionicons name="filter" size={16} color="#6B7280" style={{ marginRight: 6 }} />
          <Text className="text-gray-600 text-xs font-semibold">Filter by Category</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="-mx-6 px-6">
        {MOCK_DOCS.map((doc, index) => {
          const isLocked = doc.status === 'Locked';
          
          return (
            <View 
              key={doc.id} 
              className={`py-4 flex-row items-center justify-between ${index !== MOCK_DOCS.length - 1 ? 'border-b border-gray-50' : ''} ${isLocked ? 'opacity-50' : ''}`}
            >
              <View className="flex-row items-center flex-1 pr-4">
                <View className="w-12 h-12 rounded-lg bg-gray-50 items-center justify-center mr-4 border border-gray-100">
                  {doc.type === 'pdf' && <MaterialCommunityIcons name="file-pdf-box" size={28} color="#EF4444" />}
                  {doc.type === 'doc' && <MaterialCommunityIcons name="file-word-box" size={28} color="#3B82F6" />}
                  {doc.type === 'list' && <MaterialCommunityIcons name="clipboard-check" size={28} color="#10B981" />}
                  {doc.type === 'zip' && <MaterialCommunityIcons name="folder-zip" size={28} color="#F59E0B" />}
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-brand-text text-base mb-1 truncate" numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <View className="flex-row items-center">
                    <Text className="text-gray-500 text-xs mr-3">{doc.category}</Text>
                    <Text className="text-gray-400 text-xs">• {doc.date}</Text>
                  </View>
                </View>
              </View>
              
              <View className="flex-row items-center">
                <View className={`px-2 py-1 rounded-md mr-4 hidden md:flex ${
                  doc.status === 'Passed' || doc.status === 'Approved' ? 'bg-green-50' : 
                  doc.status === 'Final' ? 'bg-blue-50' : 
                  doc.status === 'Review' ? 'bg-orange-50' : 'bg-gray-100'
                }`}>
                  <Text className={`text-[10px] font-bold uppercase ${
                    doc.status === 'Passed' || doc.status === 'Approved' ? 'text-green-700' : 
                    doc.status === 'Final' ? 'text-blue-700' : 
                    doc.status === 'Review' ? 'text-orange-700' : 'text-gray-500'
                  }`}>
                    {doc.status}
                  </Text>
                </View>
                
                {isLocked ? (
                  <View className="w-10 h-10 items-center justify-center rounded-full bg-gray-100">
                    <Ionicons name="lock-closed" size={18} color="#9CA3AF" />
                  </View>
                ) : (
                  <Pressable className="w-10 h-10 items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <Ionicons name="download-outline" size={18} color="#6B7280" />
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};
