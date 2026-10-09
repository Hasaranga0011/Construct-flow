import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';
import { managedProjects } from '@/services/pmData';
import { firstRelation } from '@/utils/relations';

export default function PMLabourScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState({ workers: 0, present: 0, sites: 0, overtime: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const projects = await managedProjects();
      if (!projects.length) { setRows([]); setStats({ workers: 0, present: 0, sites: 0, overtime: 0 }); return; }
      const ids = projects.map(p => p.id);
      const [assigned, attendance] = await Promise.all([
        supabase.from('site_workers').select('worker_id').in('project_id', ids),
        supabase.from('attendance').select('*, workers(profiles!user_id(full_name))').in('site_id', ids).eq('date', new Date().toISOString().slice(0, 10)).order('check_in_time', { ascending: false }),
      ]);
      if (assigned.error) throw assigned.error;
      if (attendance.error) throw attendance.error;
      const records = (attendance.data || []).map(a => ({ ...a, person: firstRelation<any>(firstRelation<any>(a.workers)?.profiles), project: projects.find(p => p.id === a.site_id) }));
      setRows(records);
      setStats({ workers: new Set((assigned.data || []).map(w => w.worker_id)).size, present: records.filter(a => a.check_in_time && !a.check_out_time).length, sites: projects.length, overtime: records.reduce((n, a) => n + Math.max(0, (Number(a.hours_worked) || 0) - 8), 0) });
    } catch (e: any) { setError(e.message || 'Unable to load attendance.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const visible = rows.filter(a => `${a.person?.full_name || ''} ${a.project?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const time = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
  return <View className="flex-1 bg-brand-light"><TopNav title="Project Labour" actionLabel="Refresh" onActionPress={load} /><ScrollView className="flex-1 p-4 md:p-6" keyboardShouldPersistTaps="handled">
    <View className="flex-row flex-wrap gap-3 mb-5">{[['Assigned Workers',stats.workers],['Currently Present',stats.present],['Managed Projects',stats.sites],['Overtime Hours',stats.overtime.toFixed(1)]].map(([label,value]) => <View key={label} className="bg-white rounded-xl p-4 flex-grow min-w-[130px]"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">{label}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold mt-2">{value}</Text></View>)}</View>
    <View className="flex-row flex-wrap gap-3 justify-between items-center mb-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold">Today?s Attendance</Text><Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => router.push('/pm/payroll')} className="bg-brand-orange rounded-lg p-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">View Payroll</Text></Pressable></View>
    <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }} placeholder="Search worker or project" value={search} onChangeText={setSearch} className="border border-gray-200 bg-white p-4 rounded-xl mb-4" />
    {!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 mb-4">{error}</Text>}
    {loading ? <ActivityIndicator color="#F97316" /> : visible.length === 0 ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 p-4">No attendance records match this view.</Text> : visible.map(a => <View key={a.id} className="bg-white rounded-xl p-5 mb-3"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-lg">{a.person?.full_name || 'Worker'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">{a.project?.name}</Text><View className="flex-row flex-wrap gap-4 mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>Check-in: {time(a.check_in_time)}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>Check-out: {time(a.check_out_time)}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>Hours: {a.hours_worked ?? 'In progress'}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}>{a.status || 'Not recorded'}</Text></View></View>)}
  </ScrollView></View>;
}
