import React, { useCallback, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { TopNav } from '@/components/common/TopNav';
import { MilestoneRow } from '@/components/common/MilestoneRow';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { Button, Card, EmptyState, ErrorState, FormField, FormModal, InlineNotice, LoadingState, Select } from '@/components/ui';

export default function ProjectMilestonesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { role } = useAuth();
  const router = useRouter();
  const base = `/${role === 'pm' ? 'pm' : 'admin'}/projects/${projectId}`;
  const load = useCallback(async (signal: AbortSignal) => {
    const [project, milestones] = await Promise.all([
      supabase.from('projects').select('id,name').eq('id', projectId).abortSignal(signal).single(),
      supabase.from('milestones').select('*,milestone_media(*)').eq('project_id', projectId).order('due_date').abortSignal(signal),
    ]);
    if (project.error) throw project.error;
    if (milestones.error) throw milestones.error;
    return { project: project.data, milestones: milestones.data || [] };
  }, [projectId]);
  const resource = useAsyncData(load);
  const retry = resource.retry;
  const hasFocused = useRef(false);
  useFocusEffect(useCallback(() => { if (hasFocused.current) retry(); else hasFocused.current = true; }, [retry]));
  const [selected, setSelected] = useState<any>(null);
  const [status, setStatus] = useState('Pending');
  const [percentage, setPercentage] = useState('0');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const update = async (id: string, data: { status: string; completion_percentage: number; description?: string }) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await api.projects.updateMilestone(projectId, id, data); setSelected(null); setMessage('Milestone progress saved.'); resource.retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save milestone progress.'); }
    finally { setBusy(false); }
  };
  const saveProgress = () => {
    const value = Number(percentage);
    if (!percentage.trim() || !Number.isFinite(value) || value < 0 || value > 100 || (status === 'Pending' && value !== 0) || (status === 'Completed' && value !== 100) || (status === 'In Progress' && value === 100)) {
      setError('Use 0% for pending, 1–99% for work in progress, or 100% for completed work.'); return;
    }
    void update(selected.id, { status, completion_percentage: value, description: description.trim() });
  };
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title={resource.data?.project?.name ? `${resource.data.project.name} · Milestones` : 'Project milestones'} showBackButton actionLabel="+ Add Milestone" onActionPress={() => router.push(`${base}/milestones/create` as any)} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><View className="max-w-5xl w-full mx-auto"><ProjectWorkspaceNav projectId={projectId} />
      <InlineNotice message={message} tone="success" />{!selected && <InlineNotice message={error} />}
      {resource.loading && !resource.data ? <LoadingState message="Loading project milestones…" /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !resource.data?.milestones.length ? <Card><EmptyState title="No milestones created" message="Break this project into dated stages so the team can report progress." icon="flag-outline" action={<Button label="Create First Milestone" onPress={() => router.push(`${base}/milestones/create` as any)} />} /></Card> : <Card>
        <Text className="text-xl font-bold text-brand-text dark:text-white mb-6">Timeline tracking</Text>
        {resource.data.milestones.map((row: any, index: number) => <MilestoneRow key={row.id} ms={row} isLast={index === resource.data!.milestones.length - 1} disabled={busy} onMarkComplete={id => void update(id, { status: 'Completed', completion_percentage: 100 })}>
          <View className="mt-3 self-start"><Button label="Update progress" accessibilityLabel={`Update progress for ${row.title}`} variant="ghost" size="compact" disabled={busy} onPress={() => { setSelected(row); setStatus(row.status === 'Completed' ? 'Completed' : Number(row.completion_percentage) > 0 ? 'In Progress' : 'Pending'); setPercentage(String(row.completion_percentage ?? 0)); setDescription(row.description || ''); setError(''); }} /></View>
        </MilestoneRow>)}
      </Card>}
    </View></ScrollView>
    <FormModal visible={!!selected} title="Update milestone progress" onClose={() => setSelected(null)} onSubmit={saveProgress} submitLabel="Save progress" busy={busy}>
      <InlineNotice message={error} /><Text className="font-semibold text-brand-text dark:text-white mb-4">{selected?.title}</Text>
      <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Milestone status</Text><View className="mb-4"><Select value={status} onValueChange={value => { setStatus(value); if (value === 'Pending') setPercentage('0'); if (value === 'Completed') setPercentage('100'); }} options={['Pending', 'In Progress', 'Completed'].map(value => ({ value, label: value }))} /></View>
      <FormField label="Completion percentage" value={percentage} onChangeText={setPercentage} keyboardType="decimal-pad" helperText="Enter the actual completed percentage from 0 to 100." />
      <FormField label="Progress notes" value={description} onChangeText={setDescription} multiline style={{ minHeight: 96 }} />
    </FormModal>
  </View>;
}
