import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Project = { id: string; name: string; location?: string | null; status?: string | null; total_budget?: number | null; spent_cost?: number | null; completion_percentage?: number | null; end_date?: string | null };

const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-LK')}`;

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-GB');
};

export default function ClientProjectPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadProjects = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.from('projects').select('id, name, location, status, total_budget, spent_cost, completion_percentage, end_date').eq('client_id', user.id).order('created_at', { ascending: false });
        if (queryError) throw queryError;
        if (isMounted) setProjects((data || []) as Project[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load projects.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadProjects();
    const channel = supabase.channel(`client-projects:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${user.id}` }, loadProjects).subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, retryKey]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Client Project" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-6">Assigned Projects</Text>
        {loading ? (
          <View className="gap-3">{[1, 2].map(item => <View key={item} className="bg-gray-100 rounded-2xl h-48 animate-pulse" />)}</View>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-center">{error}</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text></Pressable>
          </View>
        ) : projects.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center">
            <Ionicons name="business-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold mt-4">No assigned projects</Text>
          </View>
        ) : projects.map(project => {
          const progress = Number(project.completion_percentage || 0);
          return (
            <View key={project.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-4">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-xl font-bold text-brand-text">{project.name}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-1">{project.location || 'Location not provided'}</Text>
                </View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold">{progress}%</Text>
              </View>
              <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-5"><View className={`h-full bg-brand-orange rounded-full ${progress <= 0 ? 'w-0' : progress < 25 ? 'w-1/4' : progress < 50 ? 'w-1/2' : progress < 75 ? 'w-3/4' : 'w-full'}`} /></View>
              <View className="flex-row justify-between mt-4">
                <View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase">Budget</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold mt-1">{formatCurrency(Number(project.total_budget || 0))}</Text></View>
                <View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase">Spent</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold mt-1">{formatCurrency(Number(project.spent_cost || 0))}</Text></View>
                <View><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs uppercase">Target end</Text><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold mt-1">{formatDate(project.end_date)}</Text></View>
              </View>
              <View className="flex-row gap-2 mt-5">
                <Link href={`/client/project/milestones?projectId=${project.id}`} asChild><Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-1 bg-brand-orange py-3 rounded-lg items-center"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs">Milestones</Text></Pressable></Link>
                <Link href={`/client/project/${project.id}/reports`} asChild><Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-1 bg-blue-50 border border-blue-200 py-3 rounded-lg items-center"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-blue-700 font-bold text-xs">Site Reports</Text></Pressable></Link>
                <Link href={`/client/messages/${project.id}`} asChild><Pressable style={{ minHeight: 44, minWidth: 44 }} className="flex-1 border border-gray-300 py-3 rounded-lg items-center"><Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold text-xs">Message PM</Text></Pressable></Link>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
