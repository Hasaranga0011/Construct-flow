import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Button, Card, EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/ui';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';

export default function ProjectIssuesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async (signal: AbortSignal) => {
    const sites = await supabase.from('sites').select('id').eq('project_id', projectId).abortSignal(signal);
    if (sites.error) throw sites.error;
    const ids = (sites.data || []).map(site => site.id).filter((id): id is string => !!id);
    if (!ids.length) return { sites: ids, issues: [] };
    const result = await supabase.from('issues').select('*').in('site_id', ids).order('created_at', { ascending: false }).abortSignal(signal);
    if (result.error) throw result.error;
    return { sites: ids, issues: result.data || [] };
  }, [projectId]);
  const resource = useAsyncData(load);
  const resolve = async (id: string) => {
    if (busyId || !resource.data?.sites.length) return;
    setBusyId(id); setError(''); setMessage('');
    try {
      const result = await supabase.from('issues').update({ status: 'Resolved' }).eq('id', id).in('site_id', resource.data.sites).select('id');
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error('This issue could not be updated. Refresh and try again.');
      setMessage('Project issue marked as resolved.'); resource.retry();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to resolve this issue.'); }
    finally { setBusyId(''); }
  };
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="Project Issues" showBackButton showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><View className="max-w-5xl w-full mx-auto"><ProjectWorkspaceNav projectId={projectId} /><InlineNotice message={message} tone="success" /><InlineNotice message={error} />
      {resource.loading && !resource.data ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : <Card>
        <View className="flex-row flex-wrap gap-3 items-center justify-between mb-4"><View className="flex-1 min-w-0"><Text className="text-xl font-bold text-brand-text dark:text-white">Issues & concerns</Text><Text className="text-sm text-slate-500 mt-1">Follow up site reports and client concerns in the same project register.</Text></View><Button label="Refresh issues" variant="ghost" onPress={resource.retry} /></View>
        {!resource.data?.issues.length ? <EmptyState title="No project issues" message="Site and client concerns appear here when they are reported." icon="checkmark-circle-outline" /> : resource.data.issues.map(issue => <View key={issue.id} className="py-4 border-b border-slate-100 dark:border-slate-800">
          <View className="flex-row flex-wrap justify-between gap-3"><Text className="flex-1 min-w-0 font-semibold text-brand-text dark:text-white">{issue.title}</Text><StatusBadge status={issue.status} /></View><Text className="text-sm text-slate-600 dark:text-slate-300 my-3">{issue.description}</Text><View className="flex-row flex-wrap gap-3 items-center justify-between"><StatusBadge status={issue.severity || 'Not recorded'} /><Text className="text-sm text-slate-500">{issue.created_at?.slice(0, 10)}</Text></View>
          {issue.status !== 'Resolved' && <View className="self-start mt-3"><Button label="Mark resolved" variant="secondary" size="compact" loading={busyId === issue.id} disabled={!!busyId} onPress={() => void resolve(issue.id!)} /></View>}
        </View>)}
      </Card>}
    </View></ScrollView>
  </View>;
}
