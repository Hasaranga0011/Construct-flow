import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Project = { id: string; name: string };
type Issue = { id: string; title: string; category?: string | null; status?: string | null; created_at?: string | null };
const categories = ['Quality', 'Delay', 'Safety', 'Payment', 'Other'];

export const ClientIssueForm = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Quality');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadIssues = async () => {
      try {
        setError(null);
        const { data: projectData, error: projectError } = await supabase.from('projects').select('id, name').eq('client_id', user.id);
        if (projectError) throw projectError;
        const clientProjects = (projectData || []) as Project[];
        const projectIds = clientProjects.map(project => project.id);
        const { data: issueData, error: issueError } = projectIds.length
          ? await supabase.from('issues').select('id, title, category, status, created_at').in('project_id', projectIds).order('created_at', { ascending: false })
          : { data: [], error: null };
        if (issueError) throw issueError;
        if (isMounted) {
          setProjects(clientProjects);
          setProjectId(current => current || clientProjects[0]?.id || '');
          setIssues((issueData || []) as Issue[]);
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load project issues.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadIssues();
    const channel = supabase.channel(`client-issues:${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, loadIssues).subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [user]);

  const submitIssue = async () => {
    if (!user || !projectId || !title.trim() || !description.trim()) {
      setError('Select a project and enter both a title and description.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('issues').insert({ project_id: projectId, reporter_id: user.id, title: title.trim(), description: description.trim(), category, priority: 'Medium', status: 'Open' });
      if (insertError) throw insertError;
      setTitle('');
      setDescription('');
      const message = 'Issue submitted successfully.';
      if (Platform.OS === 'web') window.alert(message); else Alert.alert('Success', message);
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to submit issue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 flex-col lg:flex-row">
      <View className="flex-[2] bg-white rounded-xl border border-gray-100 p-4 md:p-6 lg:mr-6 mb-6 lg:mb-0">
        <Text className="text-lg font-bold text-brand-text mb-1">Raise a Concern</Text>
        <Text className="text-gray-500 text-xs mb-6">Your project manager will be notified instantly.</Text>
        {error && <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4"><Text className="text-red-700">{error}</Text></View>}
        {loading ? <ActivityIndicator color="#F97316" /> : <>
          <Text className="text-brand-text font-semibold text-sm mb-2">Project</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4"><View className="flex-row gap-2">{projects.map(project => <Pressable key={project.id} onPress={() => setProjectId(project.id)} className={`px-4 py-2 rounded-full border ${projectId === project.id ? 'bg-brand-orange border-brand-orange' : 'bg-white border-gray-300'}`}><Text className={projectId === project.id ? 'text-white font-bold' : 'text-gray-600'}>{project.name}</Text></Pressable>)}</View></ScrollView>
          <Text className="text-brand-text font-semibold text-sm mb-2">Issue Title</Text>
          <TextInput className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-gray-50 text-brand-text mb-4" placeholder="Concern about recent progress" value={title} onChangeText={setTitle} />
          <Text className="text-brand-text font-semibold text-sm mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">{categories.map(item => <Pressable key={item} onPress={() => setCategory(item)} className={`px-4 py-2 rounded-full border ${category === item ? 'bg-orange-50 border-brand-orange' : 'bg-white border-gray-300'}`}><Text className={category === item ? 'text-brand-orange font-semibold' : 'text-gray-600'}>{item}</Text></Pressable>)}</View>
          <Text className="text-brand-text font-semibold text-sm mb-2">Description</Text>
          <TextInput className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-gray-50 text-brand-text h-32 mb-6" placeholder="Describe the issue in detail" multiline textAlignVertical="top" value={description} onChangeText={setDescription} />
          <Pressable onPress={submitIssue} disabled={submitting} className={`py-3 rounded-lg items-center ${submitting ? 'bg-orange-300' : 'bg-brand-orange'}`}><Text className="text-white font-bold">{submitting ? 'Submitting...' : 'Submit Issue'}</Text></Pressable>
        </>}
      </View>
      <View className="flex-[1] bg-white rounded-xl border border-gray-100 p-5">
        <Text className="text-base font-bold text-brand-text mb-4">Past Issues</Text>
        {issues.length === 0 ? <Text className="text-gray-500">No issues have been submitted.</Text> : <ScrollView>{issues.map(issue => <View key={issue.id} className="py-3 border-b border-gray-50"><Text className="font-semibold text-brand-text">{issue.title}</Text><Text className="text-gray-400 text-xs mt-1">{issue.category || 'Other'} · {issue.created_at ? new Date(issue.created_at).toLocaleDateString('en-GB') : 'Date not set'}</Text><Text className="text-orange-700 text-xs font-bold mt-2">{issue.status || 'Open'}</Text></View>)}</ScrollView>}
      </View>
    </View>
  );
};
