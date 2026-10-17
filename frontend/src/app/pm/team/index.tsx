import { firstRelation } from '@/utils/relations';
import { assignedWorkers } from '@/services/siteData';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import { TopNav } from '../../../components/common/TopNav';
import { SearchInput } from '@/components/common/SearchInput';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';
import { useResponsive } from '@/hooks/useResponsive';
import { RoleAvatar } from '@/components/common/RoleAvatar';

type TeamMember = { id: string; full_name?: string | null; email?: string | null; role?: string | null; avatar_url?: string | null };

export default function PMTeamPage() {
	const router = useRouter();
	const { isMobile } = useResponsive();
	const [members, setMembers] = useState<TeamMember[]>([]);
	const [error, setError] = useState('');
	const [refresh, setRefresh] = useState(0);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');

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
				const projectIds = (projects || []).map(project => project.id).filter((id): id is string => Boolean(id));
				if (projectIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const [{ data: managers, error: managerError }, workers] = await Promise.all([
					supabase.from('site_manager_sites').select('site_manager_id').in('project_id', projectIds),
					assignedWorkers(projectIds)
				]);
				if (managerError) throw managerError;
				
				const workerUserIds = workers.map(w => w.profiles?.id).filter((id): id is string => Boolean(id));
				const managerIds = (managers || []).map(manager => manager.site_manager_id).filter((id): id is string => Boolean(id));
				const memberIds = [...new Set([...workerUserIds, ...managerIds])];
				
				if (memberIds.length === 0) {
					if (mounted) setMembers([]);
					return;
				}

				const { data, error: peopleError } = await supabase.from('profiles').select('id, full_name, email, role, avatar_url').in('id', memberIds);
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
				<View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: isMobile ? 'flex-start' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 12 : 0, zIndex: 50, elevation: 50 }}>
					<View>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-1">Your Project Team</Text>
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Only workers and site managers assigned to your projects are shown.</Text>
					</View>
					<SearchInput 
						placeholder="Search team members..." 
						value={search} 
						onChangeText={setSearch} 
						items={members} 
						entityLabel="team" 
						className={isMobile ? "w-full" : "w-80"}
						config={{
							table: 'profiles',
							searchColumn: 'full_name',
							secondaryColumn: 'email',
							titleColumn: 'full_name',
							subtitleColumn: 'email'
						}}
					/>
				</View>
				{loading ? <ActivityIndicator color="#F97316" /> : members.filter(m => (m.full_name || '').toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase())).length === 0 ? (
					<View className="bg-white rounded-xl border border-gray-100 p-8 items-center">
						<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">No team members match your search.</Text>
					</View>
				) : members.filter(m => (m.full_name || '').toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase())).map(member => (
					<Pressable key={member.id} onPress={() => router.push(`/pm/team/${member.id}` as any)} className="bg-white rounded-xl border border-gray-100 p-4 mb-3 shadow-sm active:opacity-70 flex-row items-center justify-between">
						<View className="flex-row items-center flex-1 pr-3">
							<RoleAvatar
								size="md"
								avatarUrl={member.avatar_url}
								role={member.role}
								name={member.full_name}
								showRoleBadge
								className="mr-3 shrink-0"
							/>
							<View className="flex-1 min-w-0">
								<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-base font-bold text-brand-text">{member.full_name || 'Unnamed member'}</Text>
								<Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-0.5">{member.email || 'No email available'}</Text>
							</View>
						</View>
						<View className="px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 shrink-0">
							<Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-[10px] font-bold uppercase">{(member.role || 'team member').replace('_', ' ')}</Text>
						</View>
					</Pressable>
				))}
			</ScrollView>
		</View>
	);
}
