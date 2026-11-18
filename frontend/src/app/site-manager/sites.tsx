import React, { useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAssignedSites } from '@/hooks/useAssignedSites';
import { useAsyncData } from '@/hooks/useAsyncData';
import { supabase } from '@/lib/supabase';
import { TopNav } from '@/components/common/TopNav';
import { Card, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';

export default function AssignedSitesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const assignments = useAssignedSites(user?.id);
  const ids = assignments.assignedProjectIds;
  const load = useCallback(async () => {
    if (!ids.length) return [];
    const { data, error } = await supabase.from('projects').select('id,name,location,status').in('id', ids);
    if (error) throw error;
    return data || [];
  }, [ids]);
  const resource = useAsyncData(load);
  return <View className="flex-1 bg-brand-light dark:bg-slate-950">
    <TopNav title="Assigned Sites" showAction={false} showBackButton />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {assignments.loading || resource.loading ? <LoadingState /> : assignments.error || resource.error ? <ErrorState message={assignments.error || resource.error || 'Could not load assigned sites.'} onRetry={() => { assignments.refresh(); resource.retry(); }} /> : !resource.data?.length ? <EmptyState title="No sites assigned" message="Your Project Manager can assign you to a project site." /> : resource.data.map(project => <Card key={project.id}><Text className="text-xl font-bold text-brand-text dark:text-white mb-2">{project.name}</Text><Text className="text-slate-500 dark:text-slate-300 mb-2">{project.location || 'Location not recorded'}</Text><Text className="text-sm text-slate-500 mb-4">{project.status}</Text><Button label="View assigned site team" onPress={() => router.push('/site-manager/team')} /></Card>)}
    </ScrollView>
  </View>;
}
