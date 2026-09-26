import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, KeyboardAvoidingView,
  Platform, Pressable, ActivityIndicator,
} from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type Message = {
  id: string;
  project_id: string;
  message?: string | null;
  content?: string | null;
  sender_id: string;
  receiver_id: string;
  sender_role?: string | null;
  receiver_role?: string | null;
  created_at: string;
};

type Channel = 'pm' | 'super_admin' | 'site_manager';

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'pm',           label: 'Project Manager' },
  { key: 'super_admin',  label: 'Admin' },
  { key: 'site_manager', label: 'Site Manager' },
];

/**
 * Client messages thread — supports 3-way channels (PM / Admin / Site Manager).
 * The route receives `?channel=pm|super_admin|site_manager` from the index screen,
 * or defaults to 'pm' for backwards compatibility.
 */
export default function ClientMessagesThreadPage() {
  const { threadId, channel: channelParam } = useLocalSearchParams<{ threadId: string; channel?: string }>();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [activeChannel, setActiveChannel] = useState<Channel>((channelParam as Channel) || 'pm');
  const [messages, setMessages] = useState<Message[]>([]);
  const [projectName, setProjectName] = useState('Project Conversation');
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load project info and fetch the right receiver for the active channel.
  useEffect(() => {
    if (!user || !threadId) return;
    let isMounted = true;

    const loadThread = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        // Fetch project + roles assigned to the project.
        const projectRes = await supabase
          .from('projects')
          .select('name, pm_id, client_id')
          .eq('id', threadId)
          .eq('client_id', user.id)
          .single();
        if (projectRes.error) throw projectRes.error;

        if (isMounted) setProjectName(projectRes.data?.name || 'Project Conversation');

        // Determine receiver_id based on active channel.
        let rId: string | null = null;
        if (activeChannel === 'pm') {
          rId = projectRes.data?.pm_id || null;
        } else if (activeChannel === 'super_admin') {
          // Pick the first super_admin profile.
          const adminRes = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'super_admin')
            .limit(1)
            .single();
          rId = adminRes.data?.id || null;
        } else if (activeChannel === 'site_manager') {
          // Pick the first site manager assigned to this project.
          const smRes = await supabase
            .from('site_manager_sites')
            .select('site_manager_id')
            .eq('project_id', threadId)
            .limit(1)
            .single();
          rId = smRes.data?.site_manager_id || null;
        }
        if (isMounted) setReceiverId(rId);

        // Fetch messages for this channel (both directions).
        const msgRes = await supabase
          .from('client_messages')
          .select('id, project_id, message, content, sender_id, receiver_id, sender_role, receiver_role, created_at')
          .eq('project_id', threadId)
          .or(
            `and(sender_role.eq.client,receiver_role.eq.${activeChannel}),` +
            `and(sender_role.eq.${activeChannel},receiver_role.eq.client)`
          )
          .order('created_at', { ascending: true });
        if (msgRes.error) throw msgRes.error;
        if (isMounted) setMessages((msgRes.data || []) as Message[]);
      } catch (loadError: any) {
        if (isMounted) setError(loadError.message || 'Failed to load conversation.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadThread();

    // Realtime: channel key includes project_id + channel pair to isolate from other channels.
    const realtimeChannel = supabase
      .channel(`client-msg:${threadId}:${activeChannel}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_messages',
        filter: `project_id=eq.${threadId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        // Only accept messages that belong to this channel direction.
        const isForThisChannel =
          (msg.sender_role === 'client' && msg.receiver_role === activeChannel) ||
          (msg.sender_role === activeChannel && msg.receiver_role === 'client');
        if (isForThisChannel && isMounted) {
          setMessages(current =>
            current.some(m => m.id === msg.id) ? current : [...current, msg]
          );
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(realtimeChannel);
    };
  }, [user, threadId, activeChannel]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !user || !threadId || !receiverId || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: sendError } = await supabase
        .from('client_messages')
        .insert({
          project_id: threadId,
          sender_id: user.id,
          receiver_id: receiverId,
          sender_role: 'client',
          receiver_role: activeChannel,
          message: trimmed,
          content: trimmed,
          is_read: false,
        })
        .select('id, project_id, message, content, sender_id, receiver_id, sender_role, receiver_role, created_at')
        .single();
      if (sendError) throw sendError;
      if (data) {
        setMessages(current =>
          current.some(m => m.id === data.id) ? current : [...current, data as Message]
        );
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
      setInput('');
    } catch (sendError: any) {
      setError(sendError.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-brand-light"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TopNav title={projectName} showAction={false} />

      {/* Channel tab strip */}
      <View className="bg-white border-b border-gray-100 flex-row px-4">
        {CHANNELS.map(ch => (
          <Pressable
            key={ch.key}
            onPress={() => setActiveChannel(ch.key)}
            className={`mr-6 py-3 border-b-2 ${activeChannel === ch.key ? 'border-brand-orange' : 'border-transparent'}`}
          >
            <Text className={`text-sm font-semibold ${activeChannel === ch.key ? 'text-brand-orange' : 'text-gray-400'}`}>
              {ch.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Messages list */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 p-4"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="flex-1 py-20 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : error && messages.length === 0 ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-5 items-center mt-10">
            <Text className="text-red-700 text-center">{error}</Text>
          </View>
        ) : messages.length === 0 ? (
          <View className="items-center py-20">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text className="text-gray-500 mt-4 text-center">
              No messages in this conversation yet.{'\n'}Start chatting with your {CHANNELS.find(c => c.key === activeChannel)?.label || 'contact'}.
            </Text>
          </View>
        ) : messages.map(message => {
          const isSender = message.sender_id === user?.id;
          const text = message.message || message.content;
          return (
            <View key={message.id} className={`mb-4 ${isSender ? 'self-end' : 'self-start'} max-w-[80%]`}>
              <View className={`p-3 rounded-2xl ${isSender ? 'bg-brand-orange rounded-tr-sm' : 'bg-white rounded-tl-sm shadow-sm border border-gray-100'}`}>
                <Text className={isSender ? 'text-white' : 'text-gray-800'}>{text}</Text>
                <Text className={`text-[10px] mt-1 ${isSender ? 'text-orange-100' : 'text-gray-400'}`}>
                  {formatTime(message.created_at)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input bar */}
      <View className="p-4 bg-white border-t border-gray-100 flex-row items-center">
        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm mr-2 text-brand-text outline-none"
          placeholder={receiverId ? `Message your ${CHANNELS.find(c => c.key === activeChannel)?.label || 'contact'}...` : 'No contact assigned to this project yet'}
          value={input}
          onChangeText={setInput}
          editable={!sending && !!receiverId}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <Pressable
          onPress={sendMessage}
          disabled={sending || !input.trim() || !receiverId}
          className={`w-10 h-10 rounded-full items-center justify-center ${sending || !input.trim() || !receiverId ? 'bg-gray-300' : 'bg-brand-orange'}`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="send" size={18} color="white" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
