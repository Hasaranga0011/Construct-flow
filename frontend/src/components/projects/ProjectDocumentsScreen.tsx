import React, { useCallback, useState } from 'react';
import { View, Text, Linking } from 'react-native';
import { ContentScrollView as ScrollView } from '@/components/common/ContentScrollView';
import { useLocalSearchParams } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { Button, Card, EmptyState, ErrorState, FormField, FormModal, InlineNotice, LoadingState } from '@/components/ui';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { useAsyncData } from '@/hooks/useAsyncData';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

type Document = { id: string; name?: string; filename?: string; file_name?: string; file_url?: string; url?: string; category?: string; created_at?: string };
export default function ProjectDocumentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(id) ? id[0] : id;
  const { role } = useAuth();
  const manager = role === 'admin' || role === 'pm';
  const load = useCallback(() => api.getFresh(`/workflow/projects/${projectId}/documents`) as Promise<Document[]>, [projectId]);
  const resource = useAsyncData(load);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const save = async () => {
    if (busy) return;
    try {
      if (name.trim().length < 2 || new URL(url.trim()).protocol !== 'https:') throw new Error('Enter a document name and a valid HTTPS document link.');
      setBusy(true); setError('');
      await api.post(`/workflow/projects/${projectId}/documents`, { name: name.trim(), category: category.trim() || 'General', url: url.trim() });
      setOpen(false); setMessage('Document added to this project and shared with its client.'); resource.retry();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add this document.'); }
    finally { setBusy(false); }
  };
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="Project Documents" showBackButton showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><View className="max-w-5xl w-full mx-auto">
      <ProjectWorkspaceNav projectId={projectId} />
      <InlineNotice message={message} tone="success" />{!open && <InlineNotice message={error} />}
      <Card><View className="flex-row flex-wrap justify-between items-center gap-3 mb-5"><View className="flex-1 min-w-0"><Text className="text-xl font-bold text-brand-text dark:text-white">Plans, BOQs & agreements</Text><Text className="text-sm text-slate-500 mt-1">A shared document register for this project.</Text></View>{manager && <Button label="Add document" onPress={() => { setName(''); setUrl(''); setCategory('General'); setError(''); setOpen(true); }} />}</View>
        {resource.loading && !resource.data ? <LoadingState message="Loading project documents…" /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : !resource.data?.length ? <EmptyState title="No documents added" message="Add an existing secure document link to keep plans, BOQs and agreements together." icon="documents-outline" /> : resource.data.map(row => {
          const label = row.name || row.filename || row.file_name || 'Project document';
          const link = row.file_url || row.url || '';
          return <View key={row.id} className="flex-row flex-wrap items-center gap-4 py-4 border-b border-slate-100 dark:border-slate-800"><View className="flex-1 min-w-0"><Text className="font-semibold text-brand-text dark:text-white">{label}</Text><Text className="text-sm text-slate-500 mt-1">{row.category || 'General'}{row.created_at ? ` · ${row.created_at.slice(0, 10)}` : ''}</Text></View><Button label="Open document" accessibilityLabel={`Open ${label}`} variant="secondary" size="compact" disabled={!/^https:\/\//i.test(link)} onPress={() => { void Linking.openURL(link).catch(() => setError('This document link could not be opened.')); }} /></View>;
        })}
      </Card>
    </View></ScrollView>
    <FormModal visible={open} title="Add project document" onClose={() => setOpen(false)} onSubmit={() => void save()} submitLabel="Share document" busy={busy}>
      <InlineNotice message={error} /><FormField label="Document name" value={name} onChangeText={setName} maxLength={200} placeholder="e.g. Approved architectural plan" /><FormField label="Document category" value={category} onChangeText={setCategory} maxLength={80} placeholder="Plans, BOQ, Agreement…" /><FormField label="Secure document URL" value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://…" helperText="Use a document link that the project’s client can access." />
    </FormModal>
  </View>;
}
