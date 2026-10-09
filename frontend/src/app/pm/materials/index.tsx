import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SearchInput } from '@/components/common/SearchInput';
import { useFocusEffect, useRouter } from 'expo-router';
import { ModalViewport } from '@/components/common/ModalViewport';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { managedProjects } from '@/services/pmData';
import { firstRelation } from '@/utils/relations';
import { notify } from '@/utils/notify';
import { formatMoney } from '@/utils/format';
import { sendSystemNotification } from '@/utils/notifications';

export default function PMMaterialsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'queue' | 'stock' | 'orders'>('queue');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<any>(null);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const projects = await managedProjects();
      if (!projects.length) { setRows([]); return; }
      const table = tab === 'queue' ? 'material_requests' : tab === 'stock' ? 'materials' : 'purchase_orders';
      const result = await supabase.from(table).select('*').in('project_id', projects.map(p => p.id)).order('created_at', { ascending: false });
      if (result.error) throw result.error;
      setRows((result.data || []).map(row => ({ ...row, project: projects.find(p => p.id === row.project_id), profiles: firstRelation(row.profiles) })));
    } catch (e: any) { setError(e.message || 'Unable to load materials.'); }
    finally { setLoading(false); }
  }, [tab]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const decide = async (request: any, status: 'Approved' | 'Rejected') => {
    if (busy) return;
    if (status === 'Rejected' && !reason.trim()) { notify('Reason required', 'Explain why this request is rejected.'); return; }
    setBusy(request.id);
    try {
      const result = await supabase.from('material_requests').update({ status, ...(status === 'Rejected' ? { notes: reason.trim() } : {}) }).eq('id', request.id).eq('project_id', request.project_id).eq('status', 'Pending Approval').select('id').single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('This request changed. Refresh and try again.');
      const { data: { session } } = await supabase.auth.getSession();
      let notificationFailed = false;
      if (request.requested_by) {
        await sendSystemNotification(
          `Material Request ${status}`,
          `${request.item_name}: ${status}${status === 'Rejected' ? '. ' + reason.trim() : '. A purchase order can now be arranged.'}`,
          'site_manager',
          request.requested_by,
          null,
          'general',
          request.project_id
        );
      }
      setReject(null); setReason(''); await load();
      notify(status, notificationFailed ? 'Decision saved, but the requester notification could not be sent.' : status === 'Approved' ? 'Request approved. Create a purchase order to arrange supply.' : 'Request rejected.');
    } catch (e: any) { notify('Unable to save decision', e.message); }
    finally { setBusy(null); }
  };
  const visible = rows.filter(row => `${row.item_name || row.name || row.po_number || ''} ${row.project?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <View className="flex-1 bg-brand-light">
    <TopNav title="Materials Management" actionLabel="Refresh" onActionPress={load} />
    <View className="px-4 pt-4">
      <View className="mb-3 z-50">
        <SearchInput 
          placeholder="Search item, order or project..." 
          value={search} 
          onChangeText={setSearch} 
          items={rows} 
          entityLabel="materials" 
        />
      </View>
      <View className="flex-row flex-wrap gap-2 mb-3">{([['queue','Approval Queue'],['stock','Site Stock'],['orders','Purchase Orders']] as const).map(([value,label]) => <Pressable style={{ minHeight: 44, minWidth: 44 }} key={value} onPress={() => setTab(value)} className={`rounded-lg px-3 py-3 ${tab === value ? 'bg-brand-orange' : 'bg-white'}`}><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={tab === value ? 'text-white font-bold' : 'text-gray-600'}>{label}</Text></Pressable>)}</View>
      {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 mb-3">{error}</Text>}
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
      {tab === 'orders' && <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/pm/materials/orders/create')} className="bg-brand-orange rounded-xl p-4 mb-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Create PO</Text></Pressable>}
      {loading ? <ActivityIndicator color="#F97316" /> : visible.length === 0 ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 p-5">No records match this view.</Text> : visible.map(row => <View key={row.id} className="bg-white rounded-xl p-5 mb-3">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg">{row.item_name || row.name || row.po_number}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">{row.project?.name || 'Project'}</Text>
        {tab === 'stock' ? <><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-3">Stock: {row.current_stock ?? 'Not recorded'} {row.unit}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">Minimum: {row.minimum_threshold ?? 'Not recorded'}</Text></> : <><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-3">Quantity: {row.quantity ?? row.quantity_ordered} {row.unit}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold mt-2">{row.status}</Text></>}
        {tab === 'queue' && row.status === 'Pending Approval' && <View className="flex-row gap-3 mt-4"><Pressable style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onPress={() => { setReject(row); setReason(''); }} className="border border-red-200 rounded-lg px-5 py-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 font-bold">Reject</Text></Pressable><Pressable style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onPress={() => decide(row, 'Approved')} className="bg-brand-orange rounded-lg px-5 py-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{busy === row.id ? 'Saving...' : 'Approve'}</Text></Pressable></View>}
        {tab === 'queue' && !!row.notes && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-3">{row.notes}</Text>}
        {tab === 'orders' && <><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="mt-2">Total: {row.total_price == null ? 'Not recorded' : formatMoney(Number(row.total_price))}</Text><Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push(`/pm/materials/orders/${row.id}`)} className="bg-gray-100 rounded-lg p-3 mt-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold">View Order</Text></Pressable></>}
      </View>)}
    </ScrollView>
    <Modal visible={!!reject} transparent onRequestClose={() => !busy && setReject(null)}><ModalViewport><ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 24 }} className="bg-white rounded-2xl w-full max-w-md"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold mb-4">Reject Request</Text><TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} multiline value={reason} onChangeText={setReason} placeholder="Reason for rejection" className="border border-gray-200 rounded-xl p-4 mb-4 min-h-[100px]" /><Pressable style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onPress={() => decide(reject, 'Rejected')} className="bg-brand-orange p-4 rounded-xl"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-center">Confirm Rejection</Text></Pressable><Pressable style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onPress={() => setReject(null)} className="p-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-center">Cancel</Text></Pressable></ScrollView></ModalViewport></Modal>
  </View>;
}
