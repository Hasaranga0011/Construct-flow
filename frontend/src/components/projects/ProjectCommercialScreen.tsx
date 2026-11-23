import React from 'react';
import { View } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { ProjectCommercialPanel } from './ProjectCommercialPanel';

export default function ProjectCommercialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(id) ? id[0] : id;
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="Payments & Variations" showBackButton showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><View className="w-full max-w-5xl mx-auto"><ProjectWorkspaceNav projectId={projectId} /><ProjectCommercialPanel projectId={projectId} /></View></ScrollView>
  </View>;
}
