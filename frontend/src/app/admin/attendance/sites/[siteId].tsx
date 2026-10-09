import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '@/lib/supabase';

type Attendance = { id: string; worker_id: string; worker_name?: string; date: string; check_in_time: string | null; check_out_time: string | null; hours_worked: number | null };
export default function AdminSiteAttendancePage() {
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const result = await supabase.from('attendance').select('id,worker_id,date,check_in_time,check_out_time,hours_worked').eq('site_id', siteId).order('date', { ascending: false });
        if (result.error) throw result.error;
        const rows = (result.data || []) as Attendance[];
        const ids = [...new Set(rows.map(row => row.worker_id).filter(Boolean))];
        const workers = ids.length ? await supabase.from('workers').select('id,user_id').in('id', ids) : { data: [], error: null };
        if (workers.error) throw workers.error;
        const userByWorker = new Map((workers.data || []).map(worker => [worker.id, worker.user_id || worker.id]));
        const profileIds = [...new Set(ids.map(id => userByWorker.get(id) || id))];
        const profiles = profileIds.length ? await supabase.from('profiles').select('id,full_name').in('id', profileIds) : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const nameById = new Map((profiles.data || []).map(profile => [profile.id, profile.full_name]));
        if (active) setRecords(rows.map(row => ({ ...row, worker_name: nameById.get(userByWorker.get(row.worker_id) || row.worker_id) || 'Worker' })));
      } catch (cause: any) { if (active) setError(cause.message || 'Unable to load attendance.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const channel = supabase.channel(`admin-site-attendance:${siteId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `site_id=eq.${siteId}` }, () => setRefresh(value => value + 1)).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [siteId, refresh]);
  return <View className="flex-1 bg-brand-light"><TopNav title="Site Attendance" showAction={false} />
    <ScrollView keyboardShouldPersistTaps="handled" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {loading ? <ActivityIndicator color="#F97316" /> : error ? <Text className="text-red-600">{error}</Text> : !records.length ? <View className="items-center py-16"><Ionicons name="calendar-outline" size={48} color="#D1D5DB" /><Text className="text-gray-500 mt-4">No attendance records for this site.</Text></View> : records.map(record => {
        const status = record.check_in_time ? record.check_out_time ? 'Checked out' : 'On site' : 'Pending';
        return <View key={record.id} className="bg-white rounded-lg border border-gray-100 p-4 mb-3 min-w-0">
          <Text maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">{record.worker_name}</Text>
          <Text maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">{new Date(record.date).toLocaleDateString('en-GB')}</Text>
          <Text maxFontSizeMultiplier={1.3} className="text-brand-orange font-semibold mt-2">{status}</Text>
          <Text maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-2">Hours worked: {record.hours_worked ?? 0}</Text>
        </View>;
      })}
    </ScrollView>
  </View>;
}
