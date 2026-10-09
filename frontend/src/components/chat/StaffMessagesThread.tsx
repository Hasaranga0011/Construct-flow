import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Message = {
  id: string;
  project_id: string;
  message_text?: string | null;
  sender_id: string;
  receiver_id: string;
  sender_role?: string | null;
  receiver_role?: string | null;
  created_at: string;
};

export default function StaffMessagesThread({ threadId }: { threadId: string }) {
  const { user, role } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [projectName, setProjectName] = useState('Client Conversation');
  const [clientId, setClientId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !threadId || !role) return;
    let isMounted = true;

    const loadThread = async () => {
      setLoading(true);
      setError(null);
      try {
        const projectRes = await supabase.from('projects').select('name, client_id').eq('id', threadId).single();
        if (projectRes.error) throw projectRes.error;
        if (isMounted) {
          setProjectName(projectRes.data?.name || 'Client Conversation');
          setClientId(projectRes.data?.client_id || null);
        }

        const msgRes = await supabase
          .from('client_messages')
          .select('*')
          .eq('project_id', threadId)
          .or(`and(sender_role.eq.client,receiver_role.eq.${role}),and(sender_role.eq.${role},receiver_role.eq.client)`)
          .order('created_at', { ascending: true });
        if (msgRes.error) throw msgRes.error;
        if (isMounted) setMessages((msgRes.data || []) as Message[]);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadThread();

    const realtimeChannel = supabase
      .channel(`staff-msg:${threadId}:${role}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_messages',
        filter: `project_id=eq.${threadId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        const isForThisChannel = (msg.sender_role === 'client' && msg.receiver_role === role) || (msg.sender_role === role && msg.receiver_role === 'client');
        if (isForThisChannel && isMounted) {
          setMessages(current => current.some(m => m.id === msg.id) ? current : [...current, msg]);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(realtimeChannel);
    };
  }, [user, threadId, role]);

  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchMissingProfiles = async () => {
      const missingIds = [...new Set(messages.map(m => m.sender_id).filter(id => id && !profiles[id]))];
      if (missingIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, full_name').in('id', missingIds);
        if (data) {
          const newProfiles = { ...profiles };
          data.forEach(p => { newProfiles[p.id] = p.full_name || 'Unknown'; });
          setProfiles(newProfiles);
        }
      }
    };
    fetchMissingProfiles();
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !user || !threadId || !clientId || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: sendError } = await supabase.from('client_messages').insert({
        project_id: threadId,
        sender_id: user.id,
        receiver_id: clientId,
        sender_role: role,
        receiver_role: 'client',
        message_text: trimmed,
        is_read: false,
      }).select('*').single();
      if (sendError) throw sendError;
      if (data) {
        setMessages(current => current.some(m => m.id === data.id) ? current : [...current, data as Message]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
      setInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView className="flex-1 bg-brand-light dark:bg-[#0F172A]" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TopNav title={projectName + " (Client)"} showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" ref={scrollRef} className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#F97316" className="mt-10" />
        ) : error && messages.length === 0 ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 mt-10 text-center">{error}</Text>
        ) : messages.length === 0 ? (
          <View className="items-center py-20">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 mt-4 text-center">No messages yet. Say hello to the client.</Text>
          </View>
        ) : messages.map(message => {
          const isSender = message.sender_id === user?.id;
          const senderName = isSender ? 'You' : (profiles[message.sender_id] || (message.sender_role ? message.sender_role.replace('_', ' ') : 'Client'));
          return (
            <View key={message.id} className={`mb-4 ${isSender ? 'self-end' : 'self-start'} max-w-[80%]`}>
              <View className={`p-3 rounded-2xl ${isSender ? 'bg-brand-orange rounded-tr-sm' : 'bg-white dark:bg-[#1E293B] rounded-tl-sm shadow-sm border border-gray-100 dark:border-gray-800'}`}>
                {!isSender && (
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 capitalize">
                    {senderName}
                  </Text>
                )}
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={isSender ? 'text-white' : 'text-gray-800 dark:text-gray-200'}>{message.message_text}</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] mt-1 ${isSender ? 'text-orange-100 text-right' : 'text-gray-400 text-left'}`}>{formatTime(message.created_at)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View className="p-4 bg-white dark:bg-[#0B0F19] border-t border-gray-100 dark:border-gray-900 flex-row items-center">
        <TextInput maxFontSizeMultiplier={1.3} style={{ minHeight: 44, minWidth: 44 }}
          className="flex-1 bg-gray-100 dark:bg-gray-800 dark:text-white rounded-full px-4 py-2.5 text-sm mr-2 outline-none"
          placeholder="Message client..." placeholderTextColor="#9ca3af"
          value={input} onChangeText={setInput} editable={!sending} onSubmitEditing={sendMessage} returnKeyType="send"
        />
        <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={sendMessage} disabled={sending || !input.trim()}
          className={`w-11 h-11 rounded-full items-center justify-center ${sending || !input.trim() ? 'bg-gray-300 dark:bg-gray-700' : 'bg-brand-orange'}`}>
          {sending ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={18} color="white" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
