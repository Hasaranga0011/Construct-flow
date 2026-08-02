import React from 'react';
import { View } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { ClientIssueForm } from '../../components/client/ClientIssueForm';

export default function IssuesScreen() {
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav 
        title="Raise an Issue" 
        showAction={false}
      />
      
      <View className="flex-1 p-6">
        <ClientIssueForm />
      </View>
    </View>
  );
}
