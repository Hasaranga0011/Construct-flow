import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { ProjectCommercialPanel } from '@/components/projects/ProjectCommercialPanel';
import { Select, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useAsyncData } from '@/hooks/useAsyncData';

export default function ClientFinancialsScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const [selected, setSelected] = useState('');
  const load = useCallback(async () => {
    if (!userId) return [];
    const { data, error } = await supabase.from('projects').select('id,name').eq('client_id',userId).order('name');
    if (error) throw error;
    return data || [];
  }, [userId]);
  const resource = useAsyncData(load);
  const projects = resource.data || [];
  const active = projects.some(project => project.id === selected) ? selected : projects[0]?.id;
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="Payments & variations" showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:16,paddingBottom:48 }}><View className="w-full max-w-5xl mx-auto">
      {resource.loading && !resource.data ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !projects.length ? <EmptyState title="No project assigned" message="Your payment plan and scope approvals appear once a project is assigned to you." /> : <>
        <Card><Text className="font-semibold text-brand-text dark:text-white mb-3">Choose your project</Text><Select value={active || ''} onValueChange={setSelected} options={projects.map(project=>({value:project.id!,label:project.name || 'Project'}))} /></Card>
        {active && <ProjectCommercialPanel key={active} projectId={active} />}
      </>}
    </View></ScrollView>
  </View>;
}
