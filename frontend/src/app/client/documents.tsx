import React from 'react';
import { View, Text } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { ClientDocumentList } from '../../components/client/ClientDocumentList';

export default function DocumentsScreen() {
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Documents" 
        showAction={false}
      />
      
      <View className="flex-1 p-6">
        <ClientDocumentList />
      </View>
    </View>
  );
}
