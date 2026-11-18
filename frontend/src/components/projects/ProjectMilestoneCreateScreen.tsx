import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { Button, Card, FormField, InlineNotice } from '@/components/ui';
import { DateField } from '@/components/common/DateField';
import { api } from '@/services/api';
import { validReportDate } from '@/utils/siteWorkflow';

export default function ProjectMilestoneCreateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (busy) return;
    if (!title.trim() || !validReportDate(date)) { setError('Enter a milestone title and choose its target date.'); return; }
    setBusy(true); setError('');
    try { await api.projects.createMilestone(projectId, { title: title.trim(), description: description.trim(), due_date: date }); router.back(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create this milestone.'); }
    finally { setBusy(false); }
  };
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="New Milestone" showBackButton showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}><View className="w-full max-w-2xl mx-auto"><Card><Text className="text-xl font-bold text-brand-text dark:text-white mb-2">Milestone details</Text><Text className="text-sm text-slate-500 mb-6">Define a clear project stage and its expected completion date.</Text><InlineNotice message={error} />
      <FormField label="Milestone title" value={title} onChangeText={setTitle} maxLength={200} placeholder="e.g. Foundation Complete" />
      <FormField label="Description" value={description} onChangeText={setDescription} maxLength={10000} multiline style={{ minHeight: 112 }} placeholder="Describe the work and completion criteria" />
      <Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Target completion date</Text><DateField label="Target completion date" value={date} onChange={setDate} />
      <View className="flex-row flex-wrap gap-3 justify-end mt-6"><Button label="Cancel" variant="secondary" onPress={() => router.back()} disabled={busy} /><Button label="Add Milestone" onPress={() => void save()} loading={busy} /></View>
    </Card></View></ScrollView>
  </View>;
}
