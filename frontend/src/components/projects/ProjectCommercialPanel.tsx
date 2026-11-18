import React, { useCallback, useState } from 'react';
import { BoqItemSelect } from './BoqItemSelect';
import { View, Text } from 'react-native';
import { api, clearApiCache } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Button, Card, EmptyState, ErrorState, FormField, FormModal, InlineNotice, LoadingState } from '@/components/ui';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DateField } from '@/components/common/DateField';
import { formatMoney } from '@/utils/format';
import { validReportDate } from '@/utils/siteWorkflow';

type Payment = { id: string; description: string; amount: number; due_date: string; status: string; paid_at?: string; evidence?: string };
type Variation = { id: string; title: string; description: string; amount: number; status: string };
type Data = { payments: Payment[]; variations: Variation[] };
export function ProjectCommercialPanel({ projectId }: { projectId: string }) {
  const { role } = useAuth();
  const manager = role === 'admin' || role === 'pm';
  const load = useCallback(() => api.getFresh(`/workflow/projects/${projectId}/commercial`) as Promise<Data>, [projectId]);
  const resource = useAsyncData(load);
  const [mode, setMode] = useState<'payment' | 'variation' | 'verify' | null>(null);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [boqItemId, setBoqItemId] = useState('');
  const open = (kind: 'payment' | 'variation') => {
    setBoqItemId('');
    setMode(kind); setTitle(''); setDescription(''); setAmount(''); setDate(''); setError(''); setMessage('');
  };
  const save = async () => {
    if (busy) return;
    if (mode === 'verify') {
      if (!selected || evidence.trim().length < 10) { setError('Enter a bank transaction reference and the checks you completed (at least 10 characters).'); return; }
    } else if (!description.trim() || !amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || (mode === 'payment' && !validReportDate(date)) || (mode === 'variation' && title.trim().length < 3)) {
      setError('Complete the description and a positive amount, plus the due date or variation title.'); return;
    }
    setBusy(true); setError('');
    try {
      if (mode === 'verify') await api.post(`/workflow/payments/${selected!.id}/verify`, { amount: Number(selected!.amount), evidence: evidence.trim() });
      else await api.post(`/workflow/projects/${projectId}/commercial`, { boq_item_id: boqItemId || undefined, kind: mode, description: description.trim(), title: mode === 'variation' ? title.trim() : undefined, amount: Number(amount), due_date: mode === 'payment' ? date : undefined });
      setMessage(mode === 'verify' ? 'Payment verified and recorded as paid.' : mode === 'payment' ? 'Payment added to this project’s schedule.' : 'Variation submitted for the project client’s approval.');
      setMode(null); resource.retry();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please retry.'); }
    finally { setBusy(false); }
  };
  const review = async (row: Variation, approve: boolean) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await supabase.rpc('review_variation', { p_id: row.id, p_approve: approve });
      if (result.error) throw result.error;
      clearApiCache(); resource.retry(); setMessage(approve ? 'Variation approved. The project budget has been updated.' : 'Variation rejected.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to review this variation.'); }
    finally { setBusy(false); }
  };
  if (resource.loading && !resource.data) return <LoadingState message="Loading payments and variations…" />;
  if (resource.error && !resource.data) return <ErrorState message={resource.error} onRetry={resource.retry} />;
  const data = resource.data || { payments: [], variations: [] };
  return <View>
    <InlineNotice message={message} tone="success" />
    {!mode && <InlineNotice message={error || resource.error || ''} />}
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4">
        <View className="flex-1 min-w-0"><Text className="text-xl font-bold text-brand-text dark:text-white">Payment schedule</Text><Text className="text-sm text-slate-500 mt-1">Scheduled amounts and verified payments for this project.</Text></View>
        {manager && <Button label="Add payment" size="compact" onPress={() => open('payment')} />}
      </View>
      {!data.payments.length ? <EmptyState title="No payments scheduled" message={manager ? 'Add the client’s agreed payment stages and due dates.' : 'Your project manager will add the agreed payment stages here.'} icon="wallet-outline" /> : data.payments.map(row => <View key={row.id} className="py-4 border-b border-slate-100 dark:border-slate-800">
        <View className="flex-row flex-wrap items-start justify-between gap-3"><View className="flex-1 min-w-0"><Text className="font-semibold text-brand-text dark:text-white">{row.description}</Text><Text className="text-sm text-slate-500 mt-1">Due {row.due_date || 'Not scheduled'}</Text></View><StatusBadge status={row.status} /></View>
        <Text className="font-bold text-lg text-brand-text dark:text-white mt-3">{formatMoney(Number(row.amount))}</Text>
        {row.status === 'Paid' && <Text className="text-sm text-green-800 mt-2">Payment verified{row.paid_at ? ` · ${row.paid_at.slice(0, 10)}` : ''}</Text>}
        {manager && ['Pending', 'Overdue'].includes(row.status) && <View className="mt-3 self-start"><Button label="Verify payment" variant="secondary" size="compact" onPress={() => { setSelected(row); setEvidence(''); setError(''); setMode('verify'); }} /></View>}
      </View>)}
    </Card>
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4"><View className="flex-1 min-w-0"><Text className="text-xl font-bold text-brand-text dark:text-white">Variations & approvals</Text><Text className="text-sm text-slate-500 mt-1">Scope changes update the budget after client approval.</Text></View>{manager && <Button label="Add variation" size="compact" onPress={() => open('variation')} />}</View>
      {!data.variations.length ? <EmptyState title="No scope changes" message="New variations and the client’s decisions appear here." icon="git-compare-outline" /> : data.variations.map(row => <View key={row.id} className="py-4 border-b border-slate-100 dark:border-slate-800">
        <View className="flex-row flex-wrap justify-between gap-3"><Text className="flex-1 min-w-0 font-semibold text-brand-text dark:text-white">{row.title}</Text><StatusBadge status={row.status} /></View>
        <Text className="text-sm text-slate-600 dark:text-slate-300 mt-2">{row.description}</Text><Text className="font-bold text-lg text-brand-text dark:text-white mt-3">{formatMoney(Number(row.amount))}</Text>
        {role === 'client' && row.status === 'Pending' && <View className="flex-row flex-wrap gap-3 mt-4"><Button label="Approve variation" loading={busy} onPress={() => void review(row, true)} /><Button label="Reject variation" variant="secondary" disabled={busy} onPress={() => void review(row, false)} /></View>}
      </View>)}
      <View className="mt-4 self-start"><Button label="Refresh records" variant="ghost" onPress={resource.retry} disabled={resource.loading} /></View>
    </Card>
    <FormModal visible={!!mode} title={mode === 'verify' ? 'Verify client payment' : mode === 'payment' ? 'Add payment stage' : 'Add variation'} onClose={() => setMode(null)} onSubmit={() => void save()} submitLabel={mode === 'verify' ? 'Confirm payment received' : mode === 'payment' ? 'Save payment stage' : 'Submit for client approval'} busy={busy}>
      <InlineNotice message={error} />
      {mode !== 'verify' && <BoqItemSelect projectId={projectId} value={boqItemId} onChange={(id, row) => { setBoqItemId(id); if (row) { setDescription(row.description); setAmount(String(row.amount || 0)); if (mode === 'variation') setTitle(row.description); } }} />}
      {mode === 'verify' ? <><Text className="font-semibold text-lg text-brand-text dark:text-white mb-4">{selected?.description} · {formatMoney(Number(selected?.amount || 0))}</Text><Text className="text-slate-600 mb-4">Check the bank record and confirm the full scheduled amount before marking it paid.</Text><FormField label="Payment evidence" accessibilityLabel="Payment evidence" value={evidence} onChangeText={setEvidence} multiline style={{ minHeight: 100 }} maxLength={2000} placeholder="Bank transaction reference and verification notes" /></> : <>
        {mode === 'variation' && <FormField label="Variation title" value={title} onChangeText={setTitle} maxLength={200} placeholder="e.g. Additional boundary wall" />}
        <FormField label={mode === 'payment' ? 'Payment description' : 'Scope and reason'} value={description} onChangeText={setDescription} multiline maxLength={2000} style={{ minHeight: 88 }} placeholder={mode === 'payment' ? 'e.g. Foundation stage payment' : 'Describe what changes and why it is required'} />
        <FormField label="Amount (LKR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        {mode === 'payment' && <View className="mb-4"><Text className="font-semibold text-sm text-slate-700 dark:text-slate-200 mb-2">Payment due date</Text><DateField label="Payment due date" value={date} onChange={setDate} /></View>}
      </>}
    </FormModal>
  </View>;
}
