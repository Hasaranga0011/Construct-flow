import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type TeamMember = { id: string; full_name?: string | null; email?: string | null; role?: string | null };

export default function PMTeamPage() {
	const [members, setMembers] = useState<TeamMember[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		const loadTeam = async () => {
			try {
				const { data: sessionData } = await supabase.auth.getSession();
				const pmId = sessionData.session?.user.id;
				if (!pmId) return;

				const { data: projects } = await supabase.from('projects').select('id').eq('pm_id', pmId);
				const projectIds = (projects || []).map(project => project.id);
				if (projectIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const [{ data: projectWorkers }, { data: managers }] = await Promise.all([
					supabase.from('labour').select('user_id').in('assigned_project_id', projectIds),
					supabase.from('site_manager_sites').select('site_manager_id').in('project_id', projectIds),
				]);
				const memberIds = [...new Set([
					...(projectWorkers || []).map(worker => worker.user_id),
					...(managers || []).map(manager => manager.site_manager_id),
				].filter(Boolean))];
				if (memberIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const { data } = await supabase.from('profiles').select('id, full_name, email, role').in('id', memberIds);
				if (mounted) setMembers((data || []) as TeamMember[]);
			} finally {
				if (mounted) setLoading(false);
			}
		};

		loadTeam();
		return () => { mounted = false; };
	}, []);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Project Team" showAction={false} />
			<ScrollView className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
				<Text className="text-2xl font-bold text-brand-text mb-2">Your Project Team</Text>
				<Text className="text-gray-500 mb-6">Only workers and site managers assigned to your projects are shown.</Text>
				{loading ? <ActivityIndicator color="#F97316" /> : members.length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text className="text-gray-500">No team members are assigned yet.</Text>
					</View>
				) : members.map(member => (
					<View key={member.id} className="bg-white rounded-xl border border-gray-100 p-5 mb-3 shadow-sm">
						<Text className="text-base font-bold text-brand-text">{member.full_name || 'Unnamed member'}</Text>
						<Text className="text-gray-500 text-sm mt-1">{member.email || 'No email available'}</Text>
						<Text className="text-brand-orange text-xs font-bold uppercase mt-3">{(member.role || 'team member').replace('_', ' ')}</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}
