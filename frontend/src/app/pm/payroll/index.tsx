import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { ModalViewport } from '@/components/common/ModalViewport';
import { managedPayroll } from '@/services/pmData';
import { formatMoney } from '@/utils/format';

export default function PMPayrollPage() {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<any>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSlips(await managedPayroll()); }
    catch (e: any) { setError(e.message || 'Unable to load payroll.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const amount = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? 'Not recorded' : formatMoney(Number(value));
  const pending = slips.filter(s => String(s.status).toLowerCase() === 'pending');
  const pendingTotal = pending.reduce((sum, s) => sum + (Number.isFinite(Number(s.total_amount)) ? Number(s.total_amount) : 0), 0);
  const visible = slips.filter(s => (filter === 'All' || String(s.status).toLowerCase() === filter.toLowerCase()) && `${s.worker?.full_name || ''} ${s.project?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <View className="flex-1 bg-brand-light">
    <TopNav title="Project Payroll" actionLabel="Refresh" onActionPress={load} />
    <ScrollView className="flex-1 p-4 md:p-6" keyboardShouldPersistTaps="handled">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold mb-2">Salary Slips</Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-4">Generated payroll records for projects you manage.</Text>
      <View className="bg-white rounded-xl p-5 mb-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Pending payment: {pending.length} slips</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold mt-2">{formatMoney(pendingTotal)}</Text></View>
      <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel="Search payroll" placeholder="Search worker or project" value={search} onChangeText={setSearch} className="bg-white border border-gray-200 rounded-xl p-4 mb-4" />
      <View className="flex-row flex-wrap gap-3 mb-4">{['All', 'Pending', 'Paid'].map(status => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={status} onPress={() => setFilter(status)} className={`px-4 py-3 rounded-lg ${filter === status ? 'bg-brand-orange' : 'bg-white'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={filter === status ? 'text-white font-bold' : 'text-gray-700'}>{status}</Text></Pressable>)}</View>
      {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 mb-4">{error}</Text>}
      {loading ? <ActivityIndicator color="#F97316" /> : visible.length === 0 ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 p-4">No salary slips match these filters.</Text> : visible.map(s => <View key={s.id} className="bg-white rounded-xl p-5 mb-3">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg">{s.worker?.full_name || 'Worker'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">{s.project?.name || 'Project'}</Text>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-3">{s.period_start} to {s.period_end}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-orange mt-2">{amount(s.total_amount)} | {s.status || 'Status not recorded'}</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }} accessibilityLabel={`View salary slip ${s.id}`} onPress={() => setSelected(s)} className="bg-gray-100 p-3 rounded-lg mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold">View Details</Text></Pressable>
      </View>)}
    </ScrollView>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><ModalViewport><ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-lg">
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold mb-4">Salary Slip Details</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>{selected?.worker?.full_name || 'Worker'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">{selected?.project?.name}</Text>
      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-4">Period: {selected?.period_start} to {selected?.period_end}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">Days worked: {selected?.total_days ?? 'Not recorded'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">Overtime hours: {selected?.total_overtime_hours ?? 'Not recorded'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold mt-4">Total: {amount(selected?.total_amount)}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">Status: {selected?.status || 'Not recorded'}</Text>
      <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setSelected(null)} className="bg-brand-orange rounded-lg p-4 mt-6"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-center font-bold">Close</Text></Pressable>
    </ScrollView></ModalViewport></Modal>
  </View>;
}
