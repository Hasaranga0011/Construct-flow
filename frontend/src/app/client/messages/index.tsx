import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Project = { id: string; name: string; pm_id?: string | null };
type Message = { id: string; project_id: string; message?: string | null; created_at: string; sender_id: string; sender_role?: string; receiver_role?: string; receiver_id?: string; read_at?: string | null };

export default function ClientMessagesPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [latestMessages, setLatestMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [activeChannel, setActiveChannel] = useState<'pm' | 'super_admin' | 'site_manager'>('pm');
  const [unreadCounts, setUnreadCounts] = useState({ pm: 0, super_admin: 0, site_manager: 0 });

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
            .select('id, project_id, message_text, created_at, sender_id, sender_role, receiver_role, receiver_id, read_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false });
          if (messageError) throw messageError;
          messageData = (data || []) as Message[];
        }

        const counts = { pm: 0, super_admin: 0, site_manager: 0 };
        messageData.forEach(m => {
          if (m.receiver_id === user.id && !m.read_at) {
            if (m.sender_role === 'pm') counts.pm++;
            else if (m.sender_role === 'super_admin') counts.super_admin++;
            else if (m.sender_role === 'site_manager') counts.site_manager++;
          }
        });

        if (isMounted) {
          setProjects(clientProjects);
          setLatestMessages(messageData);
          setUnreadCounts(counts);
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
      <View className="bg-white border-b border-gray-100 flex-row px-4">
        {[
          { key: 'pm', label: 'Project Manager', count: unreadCounts.pm },
          { key: 'super_admin', label: 'Admin', count: unreadCounts.super_admin },
          { key: 'site_manager', label: 'Site Manager', count: unreadCounts.site_manager }
        ].map(ch => (
          <Pressable style={{ minHeight: 44, minWidth: 44 }}
            key={ch.key}
            onPress={() => setActiveChannel(ch.key as any)}
            className={`mr-6 py-3 border-b-2 flex-row items-center ${activeChannel === ch.key ? 'border-brand-orange' : 'border-transparent'}`}
          >
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm font-semibold ${activeChannel === ch.key ? 'text-brand-orange' : 'text-gray-400'}`}>
              {ch.label}
            </Text>
            {ch.count > 0 && (
              <View className="ml-2 bg-brand-orange rounded-full px-1.5 py-0.5">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-[10px] font-bold">{ch.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text mb-6">Project Conversations</Text>
        {loading ? (
          <View className="gap-3">
            {[1, 2, 3].map(item => <View key={item} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}
          </View>
        ) : error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-6 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-700 text-center">{error}</Text>
            <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setRetryKey(value => value + 1)} className="bg-brand-orange px-5 py-3 rounded-lg mt-4">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">Retry</Text>
            </Pressable>
          </View>
        ) : projects.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-10 items-center">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 font-bold mt-4">No conversations yet</Text>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-center mt-2">Conversations will appear when a project is assigned to your account.</Text>
          </View>
        ) : (
          projects.map(project => {
            const message = latestMessages.find(m => 
              m.project_id === project.id && 
              ((m.sender_role === 'client' && m.receiver_role === activeChannel) ||
               (m.sender_role === activeChannel && m.receiver_role === 'client'))
            );
            const preview = message?.message_text || 'No messages yet';
            return (
              <Link key={project.id} href={`/client/messages/${project.id}?channel=${activeChannel}`} asChild>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} className="bg-white rounded-2xl border border-gray-100 p-5 mb-3 flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-orange-50 items-center justify-center mr-4">
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color="#F97316" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold">{project.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm mt-1">{preview}</Text>
                    {message && <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mt-2">{new Date(message.created_at).toLocaleDateString('en-GB')}</Text>}
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
