import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { TopNav } from '@/components/common/TopNav';
import { Button, Card, EmptyState, ErrorState, FormField, FormModal, Select, InlineNotice, LoadingState } from '@/components/ui';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { BoqEditor } from './BoqEditor';
import { formatCurrencyExact as formatMoney } from '@/utils/format';

export default function ProjectBoqScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(id) ? id[0] : id;
  const { role } = useAuth();
  const manager = role === 'admin' || role === 'pm';
  const load = useCallback(() => api.getFresh(`/boq/${projectId}`), [projectId]);
  const resource = useAsyncData(load);
  const [draft, setDraft] = useState<any>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [recordKey, setRecordKey] = useState('');
  const [lineId, setLineId] = useState('');
  const allocate = async () => {
    const record = (resource.data?.unallocated_records || []).find((row: any) => `${row.table_name}:${row.id}` === recordKey);
    if (!record || !lineId) { setError('Choose an existing record and its BOQ item.'); return; }
    setBusy(true); setError('');
    try { await api.post(`/boq/${projectId}/allocate`, { table: record.table_name, record_id: record.id, boq_item_id: lineId }); setAllocating(false); setMessage('Existing record linked to its BOQ item.'); resource.retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to link the record.'); }
    finally { setBusy(false); }
  };
  const importBoq = async () => {
    if (busy) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const asset = picked.assets[0];
      const body = new FormData();
      if (Platform.OS === 'web' && asset.file) body.append('file', asset.file);
      else body.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'text/csv' } as any);
      const parsed = await api.postFormData('/projects/parse-boq', body);
      setDraft({ ...parsed, labour_overrides: resource.data?.boq_data?.labour_overrides || [] }); setBaseRevision(resource.data?.revision || 0);
      setReason(''); setMessage('BOQ parsed. Review the editable items and save a revision to apply it.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to read the BOQ file.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft || busy) return;
    if (reason.trim().length < 5) { setError('Explain why the BOQ is changing.'); return; }
    setBusy(true); setError('');
    try { await api.put(`/boq/${projectId}`, { boq_data: draft, expected_revision: baseRevision, reason: reason.trim() }); setDraft(null); setReason(''); setMessage('BOQ revision saved. Existing stock, payments and progress were preserved.'); resource.retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save BOQ.'); }
    finally { setBusy(false); }
  };
  const data = resource.data;
  const lines = (data?.lines || []).filter((row: any) => row.description.toLowerCase().includes(query.toLowerCase()));
  return <View className="flex-1 bg-brand-light dark:bg-slate-950"><TopNav title="Project BOQ" showBackButton /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
    {manager && <ProjectWorkspaceNav projectId={projectId} />}
    {resource.loading && !data ? <LoadingState message="Loading project BOQ…" /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.retry} /> : <>
      <InlineNotice message={error} /><InlineNotice message={message} tone="success" />
      {data?.requires_reupload && <InlineNotice tone="info" message={manager ? 'This older BOQ contains only a saved preview. Upload the original complete file before editing its baseline; the current project budget is preserved.' : 'This older BOQ contains only a saved preview. Your project manager needs to upload the complete file; the current project budget is preserved.'} />}
      <Card><Text className="text-xl font-bold text-brand-text dark:text-white">{data?.project_name}</Text><Text className="text-sm text-slate-500 mt-2">BOQ revision {data?.revision || 0}</Text>
        <View className="mt-3"><Button label={draft ? 'Discard changes and reload' : 'Refresh BOQ'} variant="ghost" disabled={busy} onPress={() => { setDraft(null); setReason(''); setError(''); setMessage(''); resource.retry(); }} /></View>
        {manager && !draft && <View className="mt-4"><Button label="Upload BOQ for review" variant="secondary" loading={busy} onPress={() => void importBoq()} /></View>}
        <Text className="text-lg font-bold text-brand-text dark:text-white mt-4">BOQ baseline: {formatMoney(Number((draft || data?.boq_data)?.total_budget || 0))}</Text>
        <Text className="text-sm text-slate-500 mt-2">Current project budget: {formatMoney(Number(data?.project_budget || 0))}. Approved variations and existing budget adjustments are preserved when the baseline changes.</Text>
        {manager && !draft && <View className="mt-4"><Button disabled={!!data?.requires_reupload} label={data?.boq_data ? 'Edit BOQ baseline' : 'Create BOQ baseline'} onPress={() => { setDraft(JSON.parse(JSON.stringify(data?.boq_data || { items: [], materials: [], labour_rates: [], milestones: [] }))); setBaseRevision(data?.revision || 0); setError(''); setMessage(''); }} /></View>}
        {draft && <><BoqEditor value={draft} onChange={setDraft} workers={data?.workers || []} /><FormField label="Reason for revision" value={reason} onChangeText={setReason} multiline maxLength={2000} /><View className="flex-row flex-wrap gap-3"><Button label="Save BOQ revision" loading={busy} onPress={() => void save()} /><Button label="Cancel changes" variant="secondary" disabled={busy} onPress={() => setDraft(null)} /></View></>}
      </Card>
      <Card><Text className="font-bold text-brand-text dark:text-white">Reconciliation</Text><Text className="text-sm text-slate-500 mt-2">Unallocated orders: {data?.unallocated_orders || 0} · Unallocated expenses: {data?.unallocated_expenses || 0}</Text><Text className="text-sm text-slate-500 mt-2">Paid payroll: {formatMoney(Number(data?.payroll_paid || 0))}. Payroll uses project BOQ daily trade rates when a worker trade matches; otherwise the worker’s agreed daily rate applies.</Text>{manager && !!data?.unallocated_records?.length && <View className="mt-4"><Button label="Link existing record" variant="secondary" onPress={() => { setAllocating(true); setRecordKey(''); setLineId(''); setError(''); }} /></View>}</Card>
      <FormField label="Search planned items" value={query} onChangeText={setQuery} />
      {!lines.length ? <EmptyState title="No BOQ items" message="Upload or add a BOQ baseline to connect planned items to this project." /> : lines.slice(0, 100).map((row: any) => <Card key={row.id}><Text className="font-bold text-brand-text dark:text-white">{row.description}{row.active ? '' : ' (previous revision)'}</Text><Text className="text-sm text-slate-500 mt-2">{row.kind} · {row.stage || 'General'} · {row.quantity} {row.unit || ''}</Text><Text className="text-sm text-slate-500 mt-2">{row.kind === 'labour' ? `Daily reference rate ${formatMoney(Number(row.rate))}` : `Planned ${formatMoney(Number(row.amount))}`} · Actual {formatMoney(Number(row.actual_cost))}</Text>{row.kind === 'material' && <Text className="text-sm text-slate-500 mt-2">Ordered {row.ordered_quantity} · Received {row.received_quantity} · Used {row.used_quantity}</Text>}<Text className="text-xs text-slate-500 mt-2">Scheduled payments {formatMoney(Number(row.payment_scheduled))} · Approved variations {formatMoney(Number(row.approved_variations))}</Text></Card>)}
      {lines.length > 100 && <Text className="text-sm text-slate-500">Showing the first 100 matching items. Search to find another item.</Text>}
      {manager && !!data?.history?.length && <Card><Text className="font-bold text-brand-text dark:text-white">Recent BOQ revisions</Text>{data.history.map((revision: any) => <Text key={revision.revision} className="text-sm text-slate-500 mt-3">Revision {revision.revision} · {revision.reason} · {String(revision.changed_at).slice(0, 10)}</Text>)}</Card>}
    </>}
  </ScrollView><FormModal visible={allocating} title="Link existing project record" onClose={() => setAllocating(false)} onSubmit={() => void allocate()} submitLabel="Save BOQ allocation" busy={busy}><InlineNotice message={error} /><Text className="text-sm text-slate-500 mb-4">Only link a record when you have confirmed its scope. No amounts or payment statuses are changed.</Text><Select value={recordKey} onValueChange={setRecordKey} placeholder="Choose an existing record" options={(data?.unallocated_records || []).map((row: any) => ({ value: `${row.table_name}:${row.id}`, label: `${row.table_name.replaceAll('_', ' ')} · ${row.label}` }))} /><View className="mt-4"><Select value={lineId} onValueChange={setLineId} placeholder="Choose the matching BOQ item" options={(data?.lines || []).filter((row: any) => row.active && row.kind !== 'labour').map((row: any) => ({ value: row.id, label: `${row.description} · ${row.quantity} ${row.unit || ''}` }))} /></View></FormModal></View>;
}
