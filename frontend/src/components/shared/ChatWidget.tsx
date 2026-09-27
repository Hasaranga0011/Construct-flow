import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export function ChatWidget({ projectId, currentUserId, currentUserRole, targetRole, targetUserId }: {
  projectId: string;
  currentUserId: string;
  currentUserRole: string;
  targetRole?: string;
  targetUserId?: string;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchMessages();
    
    // Subscribe to realtime messages
    const subscription = supabase
      .channel(`chat_${projectId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        const msg = payload.new;
        // Basic filtering for this channel
        if ((msg.sender_role === currentUserRole && msg.receiver_role === targetRole) ||
            (msg.sender_role === targetRole && msg.receiver_role === currentUserRole) ||
            (targetUserId && msg.sender_id === targetUserId) ||
            (msg.sender_id === currentUserId)) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [projectId]);

  const fetchMessages = async () => {
    try {
      let query = supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter locally for now
      const filtered = data.filter(m => 
        (m.sender_role === currentUserRole && m.receiver_role === targetRole) ||
        (m.sender_role === targetRole && m.receiver_role === currentUserRole) ||
        (targetUserId && (m.sender_id === targetUserId || m.receiver_id === targetUserId)) ||
        (m.sender_role === 'site_manager' && m.receiver_role === 'supplier') ||
        (m.sender_role === 'supplier' && m.receiver_role === 'site_manager')
      );
      
      setMessages(filtered);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 300);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const { error } = await supabase.from('messages').insert([{
        project_id: projectId,
        sender_id: currentUserId,
        sender_role: currentUserRole,
        receiver_role: targetRole,
        receiver_id: targetUserId || null,
        content: newMessage.trim(),
      }]);
      if (error) throw error;
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  if (loading) return <ActivityIndicator color="#F97316" />;

  return (
    <View className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex-col overflow-hidden min-h-[400px] max-h-[500px]">
      <View className="p-4 border-b border-gray-100 bg-gray-50 flex-row items-center">
        <Ionicons name="chatbubbles" size={20} color="#F97316" className="mr-2" />
        <Text className="font-bold text-gray-800 ml-2">Chat with {targetRole ? targetRole.replace('_', ' ') : 'Team'}</Text>
      </View>
      
      <ScrollView 
        ref={scrollViewRef}
        className="flex-1 p-4"
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {messages.length === 0 ? (
          <Text className="text-gray-400 text-center mt-4">No messages yet. Say hello!</Text>
        ) : (
          messages.map(m => {
            const isMe = m.sender_id === currentUserId;
            return (
              <View key={m.id} className={`mb-3 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}>
                <View className={`p-3 rounded-2xl ${isMe ? 'bg-brand-orange rounded-tr-none' : 'bg-gray-100 rounded-tl-none'}`}>
                  <Text className={isMe ? 'text-white' : 'text-gray-800'}>{m.content}</Text>
                </View>
                <Text className={`text-[10px] text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                  {format(new Date(m.created_at), 'HH:mm')}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="p-3 border-t border-gray-100 flex-row items-center bg-gray-50">
        <TextInput 
          className="flex-1 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-800"
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={sendMessage}
        />
        <Pressable 
          onPress={sendMessage}
          className={`ml-2 w-10 h-10 rounded-full items-center justify-center ${newMessage.trim() ? 'bg-brand-orange' : 'bg-gray-300'}`}
          disabled={!newMessage.trim()}
        >
          <Ionicons name="send" size={16} color="white" style={{ marginLeft: 2 }} />
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}
