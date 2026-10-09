import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Project = { id: string; name: string };
type Message = { id: string; project_id: string; message_text?: string | null; created_at: string; sender_id: string; sender_role?: string; receiver_role?: string; receiver_id?: string; read_at?: string | null; is_read?: boolean };

export default function StaffMessagesIndex({ basePath }: { basePath: string }) {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [latestMessages, setLatestMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !role) return;
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        let projectIds: string[] = [];
        let fetchedProjects: Project[] = [];

        if (role === 'super_admin') {
          const { data, error } = await supabase.from('projects').select('id, name').order('created_at', { ascending: false });
          if (error) throw error;
          fetchedProjects = data || [];
        } else if (role === 'pm') {
          const { data, error } = await supabase.from('projects').select('id, name').eq('pm_id', user.id).order('created_at', { ascending: false });
          if (error) throw error;
          fetchedProjects = data || [];
        } else if (role === 'site_manager') {
          const { data: smSites, error: smError } = await supabase.from('site_manager_sites').select('project_id, projects(id, name)').eq('site_manager_id', user.id);
          if (smError) throw smError;
          fetchedProjects = (smSites || []).map(s => s.projects) as any;
        }

        projectIds = fetchedProjects.map(p => p.id);
        
        let messageData: Message[] = [];
        if (projectIds.length > 0) {
          const { data, error: msgError } = await supabase
            .from('client_messages')
            .select('*')
            .in('project_id', projectIds)
            .or(`and(sender_role.eq.client,receiver_role.eq.${role}),and(sender_role.eq.${role},receiver_role.eq.client)`)
            .order('created_at', { ascending: false });
          if (msgError) throw msgError;
          messageData = data || [];
        }

        if (isMounted) {
          setProjects(fetchedProjects);
          setLatestMessages(messageData);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    const channel = supabase
      .channel(`staff-msgs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  return (
    <View className="flex-1 bg-brand-light dark:bg-[#0F172A]">
      <TopNav title="Client Messages" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-2xl font-bold text-brand-text dark:text-white mb-6">Client Conversations</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#F97316" />
        ) : error ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500">{error}</Text>
        ) : projects.length === 0 ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 dark:text-gray-400">No projects found.</Text>
        ) : (
          projects.map(project => {
            const message = latestMessages.find(m => m.project_id === project.id);
            const isUnread = message && message.sender_role === 'client' && !message.is_read;
            return (
              <Link key={project.id} href={`${basePath}/messages/${project.id}` as any} asChild>
                <Pressable style={{ minHeight: 44, minWidth: 44 }} className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-3 flex-row items-center">
                  <View className="w-11 h-11 rounded-full bg-orange-50 dark:bg-orange-900/20 items-center justify-center mr-4">
                    <Ionicons name="person" size={20} color="#F97316" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text dark:text-white font-bold">{project.name}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-sm mt-1 ${isUnread ? 'text-brand-orange font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
                      {message ? message.message_text : 'No messages yet'}
                    </Text>
                  </View>
                  {isUnread && <View className="w-3 h-3 bg-brand-orange rounded-full mr-3" />}
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
