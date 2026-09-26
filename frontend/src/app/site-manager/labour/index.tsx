import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type LabourRecord = {
	id: string;
	worker_name?: string | null;
	status?: string | null;
	date?: string | null;
	check_in_time?: string | null;
	hours_worked?: number | null;
};

export default function SiteManagerLabourPage() {
	const [records, setRecords] = useState<LabourRecord[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		const loadLabour = async () => {
			try {
				const { data: sessionData } = await supabase.auth.getSession();
				const managerId = sessionData.session?.user.id;
				if (!managerId) return;

				const { data: assignments } = await supabase
					.from('site_manager_sites')
					.select('project_id')
					.eq('site_manager_id', managerId);
				const projectIds = (assignments || []).map(assignment => assignment.project_id);
				if (projectIds.length === 0) {
					if (mounted) setRecords([]);
					return;
				}

				const { data } = await supabase
					.from('labour')
					.select('id, worker_name, status, date, check_in_time, hours_worked')
					.in('assigned_project_id', projectIds)
					.order('date', { ascending: false });
				if (mounted) setRecords((data || []) as LabourRecord[]);
			} finally {
				if (mounted) setLoading(false);
			}
		};

		loadLabour();
		return () => { mounted = false; };
	}, []);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Labour on Your Sites" showAction={false} />
			<ScrollView className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
				<Text className="text-2xl font-bold text-brand-text mb-2">Site Workforce</Text>
				<Text className="text-gray-500 mb-6">Attendance and hours are limited to workers assigned to your sites.</Text>
				{loading ? <ActivityIndicator color="#F97316" /> : records.length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text className="text-gray-500">No workforce records found for your sites.</Text>
					</View>
				) : records.map(record => (
					<View key={record.id} className="bg-white rounded-xl border border-gray-100 p-5 mb-3 shadow-sm">
						<View className="flex-row justify-between items-start">
							<View className="flex-1 pr-3">
								<Text className="text-base font-bold text-brand-text">{record.worker_name || 'Worker'}</Text>
								<Text className="text-gray-500 text-sm mt-1">{record.date || 'Date unavailable'}</Text>
							</View>
							<Text className={`font-bold ${record.status === 'Present' ? 'text-green-600' : 'text-gray-500'}`}>{record.status || 'Unknown'}</Text>
						</View>
						<Text className="text-gray-600 text-sm mt-3">Check-in: {record.check_in_time || 'Not recorded'} · Hours: {Number(record.hours_worked || 0).toFixed(1)}</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}
