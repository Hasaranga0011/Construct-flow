import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { TopNav } from '@/components/common/TopNav';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { getApiUrl } from '@/lib/apiUrl';
import { supabase } from '@/lib/supabase';

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

export default function WorkerMessagesPage() {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadChat = async () => {
      setLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        
        let pId = '';
        if (token) {
          try {
            const res = await fetch(`${getApiUrl()}/labour/worker/site`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const siteData = await res.json();
              if (siteData && siteData.project) pId = siteData.project.id;
            }
          } catch (e) {}
        }
        
        if (!pId) {
          // Fallback to a placeholder project ID for direct admin communication
          // Usually we'd have a system thread ID, but we need a valid UUID format
          pId = '00000000-0000-0000-0000-000000000000';
        }
        
        if (isMounted) setProjectId(pId);

        // Fetch Admin profile using proxy or directly
        const adminRes = await supabase.from('profiles').select('id').eq('role', 'super_admin').limit(1).maybeSingle();
        const aId = adminRes.data?.id || null;
        if (isMounted) setAdminId(aId);

        if (pId) {
          // Fetch messages
          const msgRes = await supabase
            .from('client_messages')
            .select('*')
            .eq('project_id', pId)
            .or(`and(sender_role.eq.worker,receiver_role.eq.super_admin),and(sender_role.eq.super_admin,receiver_role.eq.worker)`)
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
            .order('created_at', { ascending: true });
            
          if (isMounted && msgRes.data) {
            setMessages(msgRes.data as Message[]);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load chat.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadChat();
  }, [user]);

  useEffect(() => {
    if (!projectId || !user) return;
    const channel = supabase
      .channel(`worker-chat-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_messages',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        const msg = payload.new as Message;
        if ((msg.sender_role === 'super_admin' && msg.receiver_id === user.id) || msg.sender_id === user.id) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, user]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !user || !adminId || !projectId || sending) return;
    
    setSending(true);
    setError(null);
    try {
      const data = await api.messages.send({
        project_id: projectId,
        sender_id: user.id,
        receiver_id: adminId,
        sender_role: 'worker',
        receiver_role: 'super_admin',
        content: trimmed,
      });
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
      <TopNav title="Message Admin" showAction={false} />
      <ScrollView keyboardShouldPersistTaps="handled" ref={scrollRef} className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#F97316" className="mt-10" />
        ) : error && messages.length === 0 ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 mt-10 text-center">{error}</Text>
        ) : messages.length === 0 ? (
          <View className="items-center py-20">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-slate-400 font-medium mt-4 text-center">
              No messages yet.{'\n'}Reach out to the Admin if you need help.
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx-1].created_at).toDateString();
              return (
                <View key={msg.id || idx.toString()}>
                  {showDate && (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-center text-xs font-bold text-slate-400 my-4 uppercase tracking-wider">
                      {new Date(msg.created_at).toLocaleDateString('en-LK', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                  <View className={`flex-row mb-3 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <View className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      isMe ? 'bg-brand-primary rounded-tr-sm' : 'bg-white border border-slate-100 rounded-tl-sm shadow-sm'
                    }`}>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-base ${isMe ? 'text-white' : 'text-slate-700'}`}>
                        {msg.message_text || ''}
                      </Text>
                      <View className={`flex-row items-center mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`text-[10px] font-bold ${isMe ? 'text-orange-200' : 'text-slate-400'}`}>
                          {formatTime(msg.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <View className="p-3 bg-white border-t border-slate-100 flex-row items-center">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type your message..."
          placeholderTextColor="#94A3B8"
          className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-3 text-slate-800 mr-2 max-h-32"
          multiline
          editable={!sending && !!adminId}
        />
        <Pressable 
          onPress={sendMessage} 
          disabled={sending || !input.trim() || !adminId}
          className={`w-12 h-12 rounded-full items-center justify-center shadow-sm ${input.trim() && adminId && !sending ? 'bg-brand-primary' : 'bg-slate-200'}`}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="send" size={20} color={input.trim() && adminId && !sending ? '#FFFFFF' : '#94A3B8'} style={{ marginLeft: 4 }} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
