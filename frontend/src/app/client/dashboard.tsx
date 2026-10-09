// Modified for Expo Go mobile compatibility
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { ClientBudgetRing } from '../../components/client/ClientBudgetRing';
import { useAuth } from '../../context/AuthContext';

type Project = {
  id: string;
  name: string;
  location?: string | null;
  status?: string | null;
  total_budget?: number | null;
  spent_cost?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  completion_percentage?: number | null;
};

type Milestone = {
  id: string;
  project_id: string;
  title: string;
  status?: string | null;
  completion_percentage?: number | null;
  due_date?: string | null;
};

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
  return `Rs. ${amount.toLocaleString('en-LK')}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB');
};

const getProgressWidthClass = (progress: number) => {
  if (progress <= 0) return 'w-0';
  if (progress < 25) return 'w-1/4';
  if (progress < 50) return 'w-1/2';
  if (progress < 75) return 'w-3/4';
  return 'w-full';
};

const SkeletonCard = () => (
  <View className="flex-1 min-w-[45%] bg-gray-100 rounded-2xl p-5 h-28 animate-pulse" />
);

export default function ClientDashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [spentCosts, setSpentCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Setup Realtime subscriptions
    if (!user) return;
    
    const subProjects = supabase.channel('client-dashboard-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${user.id}` }, () => {
        setRetryKey(prev => prev + 1);
      }).subscribe();
      
    const subMilestones = supabase.channel('client-dashboard-milestones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, () => {
        setRetryKey(prev => prev + 1);
      }).subscribe();

    return () => {
      supabase.removeChannel(subProjects);
      supabase.removeChannel(subMilestones);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const loadDashboard = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, name, location, status, total_budget, spent_cost, start_date, end_date, completion_percentage')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false });

        if (projectError) throw projectError;

        const clientProjects = (projectData || []) as Project[];
        const projectIds = clientProjects.map(project => project.id);

        if (projectIds.length === 0) {
          if (isMounted) {
            setProjects([]);
            setMilestones([]);
            setSpentCosts({});
          }
          return;
        }

        const [milestoneResponse] = await Promise.all([
          supabase
            .from('milestones')
            .select('id, project_id, title, status, completion_percentage, due_date')
            .in('project_id', projectIds)
            .order('due_date', { ascending: true })
        ]);

        if (milestoneResponse.error) throw milestoneResponse.error;

        // Fetch financials for all projects
        const financialsList = await Promise.all(
          projectIds.map(async id => {
            const fin = await api.projects.financials(id).catch(() => null);
            return { id, fin };
          })
        );

        const expenseTotals = financialsList.reduce<Record<string, number>>((totals, item) => {
          if (item.fin) {
            totals[item.id] = item.fin.actual_spend || 0;
          }
          return totals;
        }, {});

        if (isMounted) {
          setProjects(clientProjects);
          setMilestones((milestoneResponse.data || []) as Milestone[]);
          setSpentCosts(expenseTotals);
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load your project dashboard.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboard();

    const channel = supabase
      .channel(`client-dashboard:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${user.id}` }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_expenses' }, loadDashboard)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, retryKey]);

  const totalBudget = projects.reduce((total, project) => total + Number(project.total_budget || 0), 0);
  const totalSpent = projects.reduce((total, project) => total + Number(project.spent_cost || spentCosts[project.id] || 0), 0);
  const completedMilestones = milestones.filter(milestone => milestone.status === 'Completed').length;
  const averageProgress = projects.length > 0
    ? Math.round(projects.reduce((total, project) => total + Number(project.completion_percentage || 0), 0) / projects.length)
    : 0;

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Client Dashboard" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text">Your Projects</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">Live progress, budget, and milestone updates.</Text>
        </View>

        {loading ? (
          <>
            <View className="flex-row flex-wrap gap-4 mb-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
            <View className="bg-gray-100 rounded-2xl h-48 animate-pulse" />
          </>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
            <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 font-semibold text-center mt-3">{error}</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text>
            </Pressable>
          </View>
        ) : projects.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center">
            <Ionicons name="business-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-lg mt-4">No projects assigned yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center mt-2">Your project information will appear here once an administrator assigns a project to your account.</Text>
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-4 mb-6">
              <View className="flex-1 min-w-[45%] bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold uppercase">Projects</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-brand-text mt-2">{projects.length}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold uppercase">Progress</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-3xl font-bold text-brand-orange mt-2">{averageProgress}%</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold uppercase">Budget</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mt-3">{formatCurrency(totalBudget)}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs font-semibold uppercase">Spent</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text mt-3">{formatCurrency(totalSpent)}</Text>
              </View>
            </View>

            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-4">Project Progress</Text>
              {projects.map(project => {
                const projectMilestones = milestones.filter(milestone => milestone.project_id === project.id);
                const projectProgress = Number(project.completion_percentage || 0);
                return (
                  <View key={project.id} className="border-b border-gray-100 py-4 last:border-b-0">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-4">
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">{project.name}</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs mt-1">{project.location || 'Location not provided'} · {project.status || 'Status not provided'}</Text>
                      </View>
                      <ClientBudgetRing 
                        spent={spentCosts[project.id] || 0} 
                        total={Number(project.total_budget || 1)} 
                      />
                    </View>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                      <View className={`h-full bg-brand-orange rounded-full ${getProgressWidthClass(projectProgress)}`} />
                    </View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-2">{projectMilestones.length} milestone{projectMilestones.length === 1 ? '' : 's'} · Target end {formatDate(project.end_date)}</Text>
                  </View>
                );
              })}
            </View>

            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text mb-4">Milestone Summary</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600">{completedMilestones} of {milestones.length} milestones completed.</Text>
              {milestones.length === 0 && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-3">No milestones have been created for your projects yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
