import { DashboardDetailLink } from '@/components/dashboard/DashboardDetailLink';
import { DashboardContent, DashboardHero, DashboardActions, DashboardSectionHeading } from '@/components/dashboard/DashboardLayout';
// Modified for Expo Go mobile compatibility
// Modified for Expo Go mobile compatibility
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { ClientBudgetRing } from '../../components/client/ClientBudgetRing';
import { useAuth } from '../../context/AuthContext';
import { router } from 'expo-router';
import { StatCard } from '../../components/common/StatCard';
import { ProjectImage } from '../../components/common/ProjectImage';
import { RoleAvatar } from '../../components/common/RoleAvatar';

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
  pm_id?: string | null;
  image_url?: string | null;
  pm?: { id: string; full_name: string; role: string; avatar_url?: string | null } | null;
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
          .select('id, name, location, status, total_budget, spent_cost, start_date, end_date, completion_percentage, pm_id, image_url, images')
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

        // Fetch PM profiles and milestones in parallel
        const pmIds = [...new Set(clientProjects.map(p => p.pm_id).filter((id): id is string => Boolean(id)))];

        const [pmProfilesRes, milestoneResponse] = await Promise.all([
          pmIds.length > 0
            ? supabase.from('profiles').select('id, full_name, role, avatar_url').in('id', pmIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from('milestones')
            .select('id, project_id, title, status, completion_percentage, due_date')
            .in('project_id', projectIds)
            .order('due_date', { ascending: true })
        ]);

        if (milestoneResponse.error) throw milestoneResponse.error;

        if (pmProfilesRes.data && pmProfilesRes.data.length > 0) {
          const pmMap = (pmProfilesRes.data as any[]).reduce((acc: any, pm) => {
            if (pm.id) acc[pm.id] = pm;
            return acc;
          }, {});
          clientProjects.forEach(p => {
            if (p.pm_id && pmMap[p.pm_id]) {
              p.pm = pmMap[p.pm_id];
            }
          });
        }

        // Initialize expenseTotals from project spent_cost directly
        const expenseTotals: Record<string, number> = {};
        const missingFinancialIds: string[] = [];
        clientProjects.forEach(p => {
          if (p.spent_cost !== null && p.spent_cost !== undefined) {
            expenseTotals[p.id] = Number(p.spent_cost);
          } else {
            missingFinancialIds.push(p.id);
          }
        });

        if (isMounted) {
          setProjects(clientProjects);
          setMilestones((milestoneResponse.data || []) as Milestone[]);
          setSpentCosts(expenseTotals);
          setLoading(false);
        }

        // Fill any missing financials asynchronously without blocking dashboard render
        if (missingFinancialIds.length > 0) {
          void Promise.all(
            missingFinancialIds.map(async id => {
              const fin = await api.projects.financials(id).catch(() => null);
              if (fin && isMounted) {
                setSpentCosts(prev => ({ ...prev, [id]: fin.actual_spend || 0 }));
              }
            })
          );
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
    <View className="flex-1 bg-brand-light dark:bg-slate-950">
      <TopNav title="Client Dashboard" showAction={false} />
      <DashboardContent>
        <DashboardHero eyebrow="Client workspace" title="Project summary" description="Current progress, upcoming milestones and payments." icon="home-outline" />
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
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 dark:text-slate-200 font-bold text-lg mt-4">No projects assigned yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-slate-400 text-center mt-2">Your project information will appear here once an administrator assigns a project to your account.</Text>
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-4 mb-6">
              <View className="flex-1 min-w-[45%] xl:min-w-0">
                <StatCard onPress={() => router.push('/client/project')} 
                  label="Assigned Projects"
                  value={projects.length.toString()}
                  indicatorText="Assigned to you"
                  indicatorType="success"
                  colorScheme="blue"
                  fullWidth
                />
              </View>
              <View className="flex-1 min-w-[45%] xl:min-w-0">
                <StatCard onPress={() => router.push('/client/project/milestones')} 
                  label="Average Progress"
                  value={`${averageProgress}%`}
                  indicatorText="Overall completion"
                  indicatorType="success"
                  colorScheme="emerald"
                  fullWidth
                />
              </View>
              <View className="flex-1 min-w-[45%] xl:min-w-0">
                <StatCard onPress={() => router.push('/client/financials')} 
                  label="Total Budget"
                  value={formatCurrency(totalBudget)}
                  indicatorText="Approved estimates"
                  colorScheme="purple"
                  fullWidth
                />
              </View>
              <View className="flex-1 min-w-[45%] xl:min-w-0">
                <StatCard onPress={() => router.push('/client/invoices')} 
                  label="Total Spent"
                  value={formatCurrency(totalSpent)}
                  indicatorText="Verified expenses"
                  colorScheme="amber"
                  fullWidth
                />
              </View>
            </View>

            <DashboardActions actions={[
              { label:'Project milestones', description:'Follow each stage of your project', icon:'flag-outline', onPress:()=>router.push('/client/project/milestones') },
              { label:'Payments & variations', description:'Review your project’s financial records', icon:'wallet-outline', onPress:()=>router.push('/client/financials') },
              { label:'Message your team', description:'Keep the conversation in one place', icon:'chatbubbles-outline', onPress:()=>router.push('/client/messages') },
            ]} />
            <DashboardDetailLink href="/client/project" label="project progress" interactive><View className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 md:p-6 mb-6">
              <DashboardSectionHeading title="Project progress" description="The latest progress and people behind your project." icon="business-outline" />
              {projects.map(project => {
                const projectMilestones = milestones.filter(milestone => milestone.project_id === project.id);
                const projectProgress = Number(project.completion_percentage || 0);
                return (
                  <View key={project.id} className="border-b border-gray-100 py-4 last:border-b-0">
                    <Pressable accessibilityRole="link" accessibilityLabel={"Open project " + project.name} onPress={() => router.push(`/client/project/${project.id}/reports` as any)} className="flex-row justify-between items-center">
                      <View className="flex-row items-center flex-1 pr-4">
                        <ProjectImage
                          project={project}
                          className="w-12 h-12 rounded-xl mr-3 shadow-sm shrink-0"
                        />
                        <View className="flex-1 min-w-0">
                          <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-slate-100 font-bold">{project.name}</Text>
                          <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-slate-400 text-xs mt-1">{project.location || 'Location not provided'} · {project.status || 'Status not provided'}</Text>
                        </View>
                      </View>
                      <ClientBudgetRing
                        spent={spentCosts[project.id] || 0}
                        total={Number(project.total_budget ?? 0)}
                      />
                    </Pressable>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                      <View className={`h-full bg-brand-orange rounded-full ${getProgressWidthClass(projectProgress)}`} />
                    </View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-2">{projectMilestones.length} milestone{projectMilestones.length === 1 ? '' : 's'} · Target end {formatDate(project.end_date)}</Text>
                    {project.pm && (
                      <View className="mt-4 p-3 bg-brand-light dark:bg-slate-800 rounded-xl flex-row flex-wrap gap-3 items-center justify-between border border-gray-100">
                        <View className="flex-row items-center" style={{ flex: 1, minWidth: 0 }}>
                          <RoleAvatar
                            size="sm"
                            avatarUrl={project.pm.avatar_url}
                            role="pm"
                            name={project.pm.full_name}
                            className="mr-3"
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text className="text-sm font-bold text-brand-text dark:text-slate-100">{project.pm.full_name}</Text>
                            <Text className="text-xs text-gray-500 dark:text-slate-400">Project Manager</Text>
                          </View>
                        </View>
                        <Pressable onPress={() => router.push(`/client/messages/${project.id}?channel=pm` as any)} accessibilityRole="button" accessibilityLabel={"Message the manager of "+project.name} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-2 rounded-lg shadow-sm min-h-[44px] items-center justify-center">
                          <Text className="text-xs font-bold text-brand-text dark:text-slate-100">Message</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View></DashboardDetailLink>

            <DashboardDetailLink href="/client/project/milestones" label="milestone summary"><View className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 md:p-6 mb-6">
              <DashboardSectionHeading title="Milestone summary" description="Every completed stage brings your project closer." icon="flag-outline" />
              <View className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full mb-4 overflow-hidden"><View className="h-full bg-orange-600 rounded-full" style={{width: (milestones.length ? completedMilestones / milestones.length * 100 : 0) + '%' as any}} /></View>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 dark:text-slate-300">{completedMilestones} of {milestones.length} milestones completed.</Text>
              {milestones.length === 0 && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 mt-3">No milestones have been created for your projects yet.</Text>}
            </View></DashboardDetailLink>
          </>
        )}
      </DashboardContent>
    </View>
  );
}
