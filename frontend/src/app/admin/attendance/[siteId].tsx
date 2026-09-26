import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type Attendance = { id: string; worker_name?: string | null; status: string; date: string; check_in_time?: string | null; check_out_time?: string | null; hours_worked?: number | null };

export default function AdminSiteAttendancePage() {
	const { siteId } = useLocalSearchParams<{ siteId: string }>();
	const [records, setRecords] = useState<Attendance[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	useEffect(() => {
		if (!siteId) return;
		let isMounted = true;
		const loadAttendance = async () => {
			if (!isMounted) return;
			setLoading(true);
			setError(null);
			try {
				const { data, error: queryError } = await supabase.from('attendance').select('*').eq('site_id', siteId).order('date', { ascending: false });
				if (queryError) throw queryError;
				if (isMounted) setRecords((data || []) as Attendance[]);
			} catch (loadError: any) {
				if (isMounted) setError(loadError.message || 'Failed to load site attendance.');
			} finally {
				if (isMounted) setLoading(false);
			}
		};
		loadAttendance();
		const channel = supabase.channel(`admin-site-attendance:${siteId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `site_id=eq.${siteId}` }, () => setRefreshTrigger(value => value + 1)).subscribe();
		return () => { isMounted = false; supabase.removeChannel(channel); };
	}, [siteId, refreshTrigger]);

	return <View className="flex-1 bg-brand-light"><TopNav title="Site Attendance" showAction={false} /><ScrollView className="flex-1 p-6">{loading ? <View className="items-center py-16"><ActivityIndicator color="#F97316" /></View> : error ? <Text className="text-red-600">{error}</Text> : records.length === 0 ? <View className="items-center py-16"><Ionicons name="calendar-outline" size={48} color="#D1D5DB" /><Text className="text-gray-500 mt-4">No attendance records for this site.</Text></View> : records.map(record => <View key={record.id} className="bg-white rounded-xl border border-gray-100 p-5 mb-3"><View className="flex-row justify-between"><View><Text className="text-brand-text font-bold">{record.worker_name || 'Worker'}</Text><Text className="text-gray-500 text-xs mt-1">{new Date(record.date).toLocaleDateString('en-GB')}</Text></View><Text className={`px-2 py-1 rounded text-xs font-bold ${record.status === 'Present' ? 'bg-green-100 text-green-700' : record.status === 'Absent' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{record.status}</Text></View><Text className="text-gray-500 text-sm mt-3">Hours worked: {record.hours_worked || 0}</Text></View>)}</ScrollView></View>;
}
