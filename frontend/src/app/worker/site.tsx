import React, { useCallback } from 'react';
import { View, Text, Linking, useWindowDimensions } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { TopNav } from '@/components/common/TopNav';
import { useAsyncData } from '@/hooks/useAsyncData';
import { api } from '@/services/api';
import { Card, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function WorkerSitePage() {
  const { width } = useWindowDimensions();
  const columns = width >= 1024;
  const load = useCallback(() => api.getFresh('/labour/worker/site'), []);
  const resource = useAsyncData(load);
  const assignment = resource.data;
  return <View className="flex-1 bg-brand-light dark:bg-slate-950">
    <TopNav title="My Site" showAction={false} showBackButton />
    <ScrollView contentContainerStyle={{ padding: width < 768 ? 16 : 24, paddingBottom: 48 }}>
      {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !assignment?.project ? <EmptyState title="No site assigned" message="Your assigned project and site contacts appear here." /> : <View style={{ flexDirection: columns ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
        <Card style={{ flex: columns ? 1.7 : undefined, minWidth: 0, marginBottom: 0 }}>
          <View className="flex-row items-start gap-3 mb-5">
            <View className="w-11 h-11 rounded-xl bg-orange-50 items-center justify-center" style={{ flexShrink: 0 }}><Ionicons name="business-outline" size={22} color="#EA580C" /></View>
            <View className="flex-1 min-w-0"><Text className="text-xs font-semibold text-slate-500 mb-1">ASSIGNED PROJECT</Text><Text className="text-xl font-bold text-brand-text dark:text-white">{assignment.project.name}</Text></View>
          </View>
          <Text className="text-xs font-semibold text-slate-500 mb-2">SITE LOCATION</Text>
          <Text className="text-sm leading-6 text-slate-600 dark:text-slate-300">{assignment.site?.address || assignment.project.location || 'Address not recorded'}</Text>
          {!!(assignment.site?.address || assignment.project.location) && <View className="mt-5"><Button label="Open location in Maps" variant="secondary" icon={<Ionicons name="navigate-outline" size={18} color="#64748B" />} onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(assignment.site?.address || assignment.project.location))} /></View>}
        </Card>
        {assignment.manager && <Card style={{ flex: columns ? 1 : undefined, minWidth: 0, marginBottom: 0 }}>
          <View className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center mb-4"><Ionicons name="person-outline" size={21} color="#64748B" /></View>
          <Text className="text-xs font-semibold text-slate-500 mb-2">SITE MANAGER</Text>
          <Text className="text-lg font-bold text-brand-text dark:text-white">{assignment.manager.full_name}</Text>
          {assignment.manager.contact_number && <View className="mt-5"><Button label="Call site manager" variant="secondary" icon={<Ionicons name="call-outline" size={18} color="#64748B" />} onPress={() => Linking.openURL('tel:' + assignment.manager.contact_number.replace(/[^+0-9]/g, '').replace(/^0/, '+94'))} /></View>}
        </Card>}
      </View>}
    </ScrollView>
  </View>;
}
