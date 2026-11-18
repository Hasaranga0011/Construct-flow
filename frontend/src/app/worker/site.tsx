import React, { useCallback } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { useAsyncData } from '@/hooks/useAsyncData';
import { api } from '@/services/api';
import { Card, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';

export default function WorkerSitePage() {
  const load = useCallback(() => api.getFresh('/labour/worker/site'), []);
  const resource = useAsyncData(load);
  const assignment = resource.data;
  return <View className="flex-1 bg-brand-light dark:bg-slate-950">
    <TopNav title="My Site" showAction={false} showBackButton />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !assignment?.project ? <EmptyState title="No site assigned" message="Your assigned project and site contacts appear here." /> : <>
        <Card><Text className="text-xl font-bold text-brand-text dark:text-white mb-2">{assignment.project.name}</Text><Text className="text-slate-500 dark:text-slate-300">{assignment.site?.address || assignment.project.location || 'Address not recorded'}</Text>
          {!!(assignment.site?.address || assignment.project.location) && <Button label="Open location in Maps" variant="secondary" onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(assignment.site?.address || assignment.project.location))} />}
        </Card>
        {assignment.manager && <Card><Text className="font-semibold text-slate-500 mb-2">Site Manager</Text><Text className="text-lg font-bold text-brand-text dark:text-white mb-3">{assignment.manager.full_name}</Text>{assignment.manager.contact_number && <Button label="Call site manager" onPress={() => Linking.openURL('tel:' + assignment.manager.contact_number.replace(/[^+0-9]/g, '').replace(/^0/, '+94'))} />}</Card>}
      </>}
    </ScrollView>
  </View>;
}
