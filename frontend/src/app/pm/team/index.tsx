import { firstRelation } from '@/utils/relations';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { supabase } from '../../../lib/supabase';

type TeamMember = { id: string; full_name?: string | null; email?: string | null; role?: string | null };

export default function PMTeamPage() {
	const [members, setMembers] = useState<TeamMember[]>([]);
	const [error, setError] = useState('');
	const [refresh, setRefresh] = useState(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		const loadTeam = async () => {
			setLoading(true); setError('');
			try {
				const { data: sessionData } = await supabase.auth.getSession();
				const pmId = sessionData.session?.user.id;
				if (!pmId) return;

				const { data: projects, error: projectError } = await supabase.from('projects').select('id').eq('pm_id', pmId);
				if (projectError) throw projectError;
				const projectIds = (projects || []).map(project => project.id);
				if (projectIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const [{ data: projectWorkers, error: workerError }, { data: managers, error: managerError }] = await Promise.all([
					supabase.from('site_workers').select('workers(user_id)').in('project_id', projectIds),
					supabase.from('site_manager_sites').select('site_manager_id').in('project_id', projectIds),
				]);
				if (workerError) throw workerError;
				if (managerError) throw managerError;
				const memberIds = [...new Set([
					...(projectWorkers || []).map(w => firstRelation(w.workers)?.user_id),
					...(managers || []).map(manager => manager.site_manager_id),
				].filter(Boolean))];
				if (memberIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const { data, error: peopleError } = await supabase.from('profiles').select('id, full_name, email, role').in('id', memberIds);
				if (peopleError) throw peopleError;
				if (mounted) setMembers((data || []) as TeamMember[]);
			} catch (e: any) { if (mounted) setError(e.message || 'Unable to load your team.'); } finally {
				if (mounted) setLoading(false);
			}
		};

		loadTeam();
		return () => { mounted = false; };
	}, [refresh]);

	return (
		<View className="flex-1 bg-brand-light">
			<TopNav title="Project Team" actionLabel="Refresh" onActionPress={() => setRefresh(v => v + 1)} />
			{!!error && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-600 p-4">{error}</Text>}
			<ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-4 md:p-6" showsVerticalScrollIndicator={false}>
				<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-2">Your Project Team</Text>
				<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mb-6">Only workers and site managers assigned to your projects are shown.</Text>
				{loading ? <ActivityIndicator color="#F97316" /> : members.length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">No team members are assigned yet.</Text>
					</View>
				) : members.map(member => (
					<View key={member.id} className="bg-white rounded-xl border border-gray-100 p-5 mb-3 shadow-sm">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-brand-text">{member.full_name || 'Unnamed member'}</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-1">{member.email || 'No email available'}</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold uppercase mt-3">{(member.role || 'team member').replace('_', ' ')}</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}
