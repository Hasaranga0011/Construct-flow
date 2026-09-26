 import React, { useEffect, useMemo, useState } from 'react';
 import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
 import { Ionicons } from '@expo/vector-icons';
 import { TopNav } from '@/components/common/TopNav';
 import { api } from '../../../../services/api';
 import { supabase } from '../../../../lib/supabase';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

 type ProjectReport = {
	 id: string;
	 name: string;
	 status: string;
	 total_budget: number;
	 spent_cost: number;
 };

 type ReportResponse = {
	 total_projects?: number;
	data?: { id: string; status?: string | null }[];
 };

 const formatCurrency = (amount: number) => {
	 if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
	 if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
	 return `Rs. ${amount.toLocaleString('en-LK')}`;
 };

 const normalizeStatus = (status?: string | null) => status || 'Unknown';

const getProgressWidthClass = (spent: number, budget: number) => {
	const ratio = budget > 0 ? spent / budget : 0;
	if (ratio <= 0) return 'w-0';
	if (ratio < 0.25) return 'w-1/4';
	if (ratio < 0.5) return 'w-1/2';
	if (ratio < 0.75) return 'w-3/4';
	return 'w-full';
};

 function ProjectBudgetChart({ data }: { data: ProjectReport[] }) {
	 if (Platform.OS !== 'web') {
		 return (
			 <View className="bg-gray-50 rounded-xl p-5">
				 {data.map(project => (
					 <View key={project.id} className="mb-4">
						 <View className="flex-row justify-between mb-2">
							 <Text className="text-brand-text text-sm font-semibold" numberOfLines={1}>{project.name}</Text>
							 <Text className="text-gray-500 text-xs">{formatCurrency(project.spent_cost)} / {formatCurrency(project.total_budget)}</Text>
						 </View>
						  <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
						   <View className={`h-full bg-brand-orange rounded-full ${getProgressWidthClass(project.spent_cost, project.total_budget)}`} />
						 </View>
					 </View>
				 ))}
			 </View>
		 );
	 }

	 return (
		 <View className="h-72 w-full">
			 <ResponsiveContainer width="100%" height="100%">
				 <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
					 <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
					 <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} />
					 <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
					 <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
					 <Legend />
					 <Bar dataKey="total_budget" name="Budget" fill="#0F1117" radius={[4, 4, 0, 0]} />
					 <Bar dataKey="spent_cost" name="Spent" fill="#F97316" radius={[4, 4, 0, 0]} />
				 </BarChart>
			 </ResponsiveContainer>
		 </View>
	 );
 }

 export default function AdminProjectReportsPage() {
	 const [projects, setProjects] = useState<ProjectReport[]>([]);
	 const [loading, setLoading] = useState(true);
	 const [error, setError] = useState<string | null>(null);
	 const [refreshTrigger, setRefreshTrigger] = useState(0);

	 useEffect(() => {
		 let isMounted = true;

		 const loadReports = async () => {
			 if (!isMounted) return;
			 setLoading(true);
			 setError(null);
			 try {
				 const report = await api.reports.projects() as ReportResponse;
				const ids = (report.data || []).map(project => project.id);
				 if (ids.length === 0) {
					 if (isMounted) setProjects([]);
					 return;
				 }

				 const { data, error: projectError } = await supabase
					 .from('projects')
					 .select('id, name, status, total_budget, spent_cost')
					 .in('id', ids)
					 .order('created_at', { ascending: false });
				 if (projectError) throw projectError;

				 if (isMounted) {
					 setProjects((data || []).map(project => ({
						 id: project.id,
						 name: project.name,
						 status: normalizeStatus(project.status),
						 total_budget: Number(project.total_budget || 0),
						 spent_cost: Number(project.spent_cost || 0),
					 })));
				 }
			 } catch (loadError: any) {
				 if (isMounted) setError(loadError.message || 'Failed to load project reports.');
			 } finally {
				 if (isMounted) setLoading(false);
			 }
		 };

		 loadReports();
		 const polling = setInterval(() => {
			 if (isMounted) setRefreshTrigger(value => value + 1);
		 }, 30000);
		 const channel = supabase
			 .channel('admin-project-reports')
			 .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
				 if (isMounted) setRefreshTrigger(value => value + 1);
			 })
			 .subscribe();

		 return () => {
			 isMounted = false;
			 clearInterval(polling);
			 supabase.removeChannel(channel);
		 };
	 }, [refreshTrigger]);

	 const statusCounts = useMemo(() => projects.reduce<Record<string, number>>((counts, project) => {
		 counts[project.status] = (counts[project.status] || 0) + 1;
		 return counts;
	 }, {}), [projects]);

	 const totalBudget = projects.reduce((sum, project) => sum + project.total_budget, 0);
	 const totalSpent = projects.reduce((sum, project) => sum + project.spent_cost, 0);

	 return (
		 <View className="flex-1 bg-brand-light">
			 <TopNav title="Project Reports" showAction={false} />
			 <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
				 {loading ? (
					 <View className="gap-4">
						 <View className="flex-row gap-4"><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /><View className="flex-1 h-28 bg-gray-100 rounded-2xl animate-pulse" /></View>
						 <View className="h-80 bg-gray-100 rounded-2xl animate-pulse" />
					 </View>
				 ) : error ? (
					 <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
						 <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
						 <Text className="text-red-700 text-center mt-3">{error}</Text>
						 <Pressable onPress={() => setRefreshTrigger(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text className="text-white font-bold">Retry</Text></Pressable>
					 </View>
				 ) : projects.length === 0 ? (
					 <View className="bg-white border border-gray-100 rounded-2xl p-10 items-center">
						 <Ionicons name="bar-chart-outline" size={48} color="#D1D5DB" />
						 <Text className="text-gray-700 font-bold mt-4">No project report data</Text>
						 <Text className="text-gray-500 text-center mt-2">Project report data will appear after projects are created.</Text>
					 </View>
				 ) : (
					 <>
						 <Text className="text-2xl font-bold text-brand-text mb-2">Project Performance</Text>
						 <Text className="text-gray-500 mb-6">Budget and status data from the project report service.</Text>
						 <View className="flex-row flex-wrap gap-4 mb-6">
							 <View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Total projects</Text><Text className="text-3xl font-bold text-brand-text mt-2">{projects.length}</Text></View>
							 <View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Total budget</Text><Text className="text-xl font-bold text-brand-text mt-3">{formatCurrency(totalBudget)}</Text></View>
							 <View className="flex-1 min-w-[45%] bg-white border border-gray-100 rounded-2xl p-5 shadow-sm"><Text className="text-gray-500 text-xs uppercase font-semibold">Total spent</Text><Text className="text-xl font-bold text-brand-orange mt-3">{formatCurrency(totalSpent)}</Text></View>
						 </View>
						 <View className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-6"><Text className="text-lg font-bold text-brand-text mb-5">Budget vs spent</Text><ProjectBudgetChart data={projects} /></View>
						 <View className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm"><Text className="text-lg font-bold text-brand-text mb-5">Status breakdown</Text>{Object.entries(statusCounts).map(([status, count]) => <View key={status} className="flex-row justify-between items-center py-3 border-b border-gray-100 last:border-b-0"><Text className="text-gray-600">{status}</Text><Text className="text-brand-text font-bold">{count}</Text></View>)}</View>
					 </>
				 )}
			 </ScrollView>
		 </View>
	 );
 }
