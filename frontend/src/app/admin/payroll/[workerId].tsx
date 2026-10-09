import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type SalarySlip = { id: string; worker_id: string; total_days?: number | null; overtime_hours?: number | null; total_payout?: number | null; total_amount?: number | null; period_start?: string | null; period_end?: string | null; status?: string | null };
const BASE_RATE = 3500;
const OVERTIME_HOURLY_RATE = (BASE_RATE / 8) * 1.5;
const formatCurrency = (amount: number) => `LKR ${amount.toLocaleString('en-LK')}`;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-GB') : 'Not set';

export default function AdminPayrollWorkerDetailPage() {
	const { workerId } = useLocalSearchParams<{ workerId: string }>();
	const [slips, setSlips] = useState<SalarySlip[]>([]);
	const [workerName, setWorkerName] = useState('Worker');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	useEffect(() => {
		if (!workerId) return;
		let isMounted = true;
		const loadPayroll = async () => {
			if (!isMounted) return;
			setLoading(true);
			setError(null);
			try {
				const [profileResponse, slipsResponse] = await Promise.all([
					supabase.from('profiles').select('full_name').eq('id', workerId).single(),
					supabase.from('salary_slips').select('*').eq('worker_id', workerId).order('period_start', { ascending: false }),
				]);
				if (profileResponse.error) throw profileResponse.error;
				if (slipsResponse.error) throw slipsResponse.error;
				if (isMounted) {
					setWorkerName(profileResponse.data?.full_name || 'Worker');
					setSlips((slipsResponse.data || []) as SalarySlip[]);
				}
			} catch (loadError: any) {
				if (isMounted) setError(loadError.message || 'Failed to load salary slips.');
			} finally {
				if (isMounted) setLoading(false);
			}
		};
		loadPayroll();
		const channel = supabase.channel(`admin-worker-payroll:${workerId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'salary_slips', filter: `worker_id=eq.${workerId}` }, () => setRefreshTrigger(value => value + 1)).subscribe();
		return () => { isMounted = false; supabase.removeChannel(channel); };
	}, [workerId, refreshTrigger]);

	return <View className="flex-1 bg-brand-light"><TopNav title={`${workerName} Payroll`} showAction={false} /><ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6">{loading ? <View className="items-center py-16"><ActivityIndicator color="#F97316" /></View> : error ? <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600">{error}</Text> : slips.length === 0 ? <View className="items-center py-16"><Ionicons name="document-text-outline" size={48} color="#D1D5DB" /><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-4">No salary slips have been generated.</Text></View> : slips.map(slip => { const days = Number(slip.total_days || 0); const overtime = Number(slip.overtime_hours || 0); const basePay = days * BASE_RATE; const overtimePay = overtime * OVERTIME_HOURLY_RATE; const total = Number(slip.total_payout ?? slip.total_amount ?? basePay + overtimePay); return <View key={slip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4"><View className="flex-row justify-between"><View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">{formatDate(slip.period_start)} - {formatDate(slip.period_end)}</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">{slip.status || 'Generated'}</Text></View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-lg">{formatCurrency(total)}</Text></View><View className="border-t border-gray-100 mt-5 pt-4 gap-2"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Base pay: <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{formatCurrency(basePay)}</Text></Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Overtime: <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{overtime.toFixed(2)} hours · {formatCurrency(overtimePay)}</Text></Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">Days worked: <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="font-bold text-brand-text">{days}</Text></Text></View></View>; })}</ScrollView></View>;
}
