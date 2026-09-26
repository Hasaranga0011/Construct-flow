import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Project = { id: string; name: string; pm_id?: string | null };
type Message = { id: string; project_id: string; message?: string | null; content?: string | null; created_at: string; sender_id: string };

export default function ClientMessagesPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [latestMessages, setLatestMessages] = useState<Record<string, Message>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadThreads = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('id, name, pm_id')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false });
        if (projectError) throw projectError;

        const clientProjects = (projectData || []) as Project[];
        const projectIds = clientProjects.map(project => project.id);
        let messageData: Message[] = [];
        if (projectIds.length > 0) {
          const { data, error: messageError } = await supabase
            .from('client_messages')
            .select('id, project_id, message, content, created_at, sender_id')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false });
          if (messageError) throw messageError;
          messageData = (data || []) as Message[];
        }

        const latest = messageData.reduce<Record<string, Message>>((result, message) => {
          if (!result[message.project_id]) result[message.project_id] = message;
          return result;
        }, {});

        if (isMounted) {
          setProjects(clientProjects);
          setLatestMessages(latest);
        }
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load conversations.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadThreads();
    const channel = supabase
      .channel(`client-message-list:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, loadThreads)
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, retryKey]);

  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="Client Messages" showAction={false} />
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-bold text-brand-text mb-6">Project Conversations</Text>
        {loading ? (
          <View className="gap-3">
            {[1, 2, 3].map(item => <View key={item} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}
          </View>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
            <Text className="text-red-700 text-center">{error}</Text>
            <Pressable onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4">
              <Text className="text-white font-bold">Retry</Text>
            </Pressable>
          </View>
        ) : projects.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text className="text-gray-700 font-bold mt-4">No conversations yet</Text>
            <Text className="text-gray-500 text-center mt-2">Conversations will appear when a project is assigned to your account.</Text>
          </View>
        ) : (
          projects.map(project => {
            const message = latestMessages[project.id];
            const preview = message?.message || message?.content || 'No messages yet';
            return (
              <Link key={project.id} href={`/client/messages/${project.id}`} asChild>
                <Pressable className="bg-white rounded-2xl border border-gray-100 p-5 mb-3 flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-orange-50 items-center justify-center mr-4">
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color="#F97316" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-brand-text font-bold">{project.name}</Text>
                    <Text className="text-gray-500 text-sm mt-1" numberOfLines={2}>{preview}</Text>
                    {message && <Text className="text-gray-400 text-xs mt-2">{new Date(message.created_at).toLocaleDateString('en-GB')}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </Pressable>
              </Link>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
