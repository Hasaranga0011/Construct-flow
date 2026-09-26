import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TopNav } from '@/components/common/TopNav';
import { api } from '../../../../services/api';
import { supabase } from '../../../../lib/supabase';

type SalarySlip = {
	id: string;
	worker_id?: string | null;
	project_id?: string | null;
	total_amount?: number | null;
	total_payout?: number | null;
	overtime_hours?: number | null;
	period_start?: string | null;
	status?: string | null;
};
type PayrollReport = { total_slips?: number; data?: SalarySlip[] };
type Project = { id: string; name: string };

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;

export default function AdminPayrollReportsPage() {
	const [slips, setSlips] = useState<SalarySlip[]>([]);
	const [projects, setProjects] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	useEffect(() => {
		let isMounted = true;
		const loadReport = async () => {
			if (!isMounted) return;
			setLoading(true);
			setError(null);
			try {
				const report = await api.reports.payroll() as PayrollReport;
				const payrollSlips = report.data || [];
				const projectIds = payrollSlips.map(slip => slip.project_id).filter((id): id is string => Boolean(id));
				let projectMap: Record<string, string> = {};
				if (projectIds.length > 0) {
					const { data, error: projectError } = await supabase.from('projects').select('id, name').in('id', projectIds);
					if (projectError) throw projectError;
					projectMap = ((data || []) as Project[]).reduce<Record<string, string>>((result, project) => {
						result[project.id] = project.name;
						return result;
					}, {});
				}
				if (isMounted) {
					setSlips(payrollSlips);
					setProjects(projectMap);
				}
			} catch (loadError: any) {
				if (isMounted) setError(loadError.message || 'Failed to load payroll reports.');
			} finally {
				if (isMounted) setLoading(false);
			}
		};
		loadReport();
		const polling = setInterval(() => {
			if (isMounted) setRefreshTrigger(value => value + 1);
		}, 30000);
		const channel = supabase
			.channel('admin-payroll-reports')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'salary_slips' }, () => {
				if (isMounted) setRefreshTrigger(value => value + 1);
			})
			.subscribe();
		return () => {
			isMounted = false;
			clearInterval(polling);
			supabase.removeChannel(channel);
		};
	}, [refreshTrigger]);

	const currentMonth = new Date().toISOString().slice(0, 7);
	const monthSlips = slips.filter(slip => !slip.period_start || slip.period_start.startsWith(currentMonth));
	const totalPayout = monthSlips.reduce((sum, slip) => sum + Number(slip.total_payout ?? slip.total_amount ?? 0), 0);
	const overtimeHours = monthSlips.reduce((sum, slip) => sum + Number(slip.overtime_hours || 0), 0);
	const paidWorkers = new Set(monthSlips.filter(slip => (slip.status || '').toLowerCase() === 'paid').map(slip => slip.worker_id).filter(Boolean)).size;
	const projectBreakdown = useMemo(() => monthSlips.reduce<Record<string, number>>((result, slip) => {
		const projectName = slip.project_id ? (projects[slip.project_id] || 'Unassigned project') : 'Unassigned project';
		result[projectName] = (result[projectName] || 0) + Number(slip.total_payout ?? slip.total_amount ?? 0);
		return result;
	}, {}), [monthSlips, projects]);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Payroll Reports" showAction={false} />
			<ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
				{loading ? (
					<View className="gap-4"><View className="flex-row gap-4"><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /></View><View className="h-64 bg-gray-100 rounded-2xl animate-pulse" /></View>
				) : error ? (
					<View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center"><Text className="text-red-700 text-center">{error}</Text><Pressable onPress={() => setRefreshTrigger(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text className="text-white font-bold">Retry</Text></Pressable></View>
				) : monthSlips.length === 0 ? (
					<View className="bg-white border border-gray-100 rounded-2xl p-10 items-center"><Ionicons name="cash-outline" size={48} color="#D1D5DB" /><Text className="text-gray-700 font-bold mt-4">No payroll records this month</Text><Text className="text-gray-500 text-center mt-2">Generated salary slips will appear here once payroll is processed.</Text></View>
				) : (
					<>
						<Text className="text-2xl font-bold text-brand-text mb-2">Payroll Performance</Text>
						<Text className="text-gray-500 mb-6">Current-month salary-slip totals and overtime.</Text>
						<View className="flex-row flex-wrap gap-4 mb-6">
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Total payout</Text><Text className="text-xl font-bold text-brand-text mt-3">{formatCurrency(totalPayout)}</Text></View>
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Workers paid</Text><Text className="text-3xl font-bold text-brand-success mt-2">{paidWorkers}</Text></View>
							<View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Overtime hours</Text><Text className="text-3xl font-bold text-brand-orange mt-2">{overtimeHours.toFixed(1)}</Text></View>
						</View>
						<View className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm"><Text className="text-lg font-bold text-brand-text mb-5">Payout by project</Text>{Object.entries(projectBreakdown).map(([project, amount]) => <View key={project} className="flex-row justify-between items-center py-3 border-b border-gray-100 last:border-b-0"><Text className="text-gray-600 flex-1 pr-4">{project}</Text><Text className="text-brand-text font-bold">{formatCurrency(amount)}</Text></View>)}</View>
					</>
				)}
			</ScrollView>
		</View>
	);
}
